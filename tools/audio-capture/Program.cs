using System.Collections.Concurrent;
using System.Diagnostics;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

var options = Options.Parse(args);
Directory.CreateDirectory(options.Output);
using var capture = new WasapiLoopbackCapture();
var chunker = new VadChunker(options, capture.WaveFormat);
var done = new TaskCompletionSource();
capture.DataAvailable += (_, e) => chunker.Add(e.Buffer.AsSpan(0, e.BytesRecorded));
capture.RecordingStopped += (_, e) => { chunker.Flush(); if (e.Exception is not null) done.TrySetException(e.Exception); else done.TrySetResult(); };
Console.CancelKeyPress += (_, e) => { e.Cancel = true; capture.StopRecording(); };
AppDomain.CurrentDomain.ProcessExit += (_, _) => chunker.Flush();
capture.StartRecording();
Console.WriteLine($"Capturing WASAPI loopback: {capture.WaveFormat}");
await done.Task;

sealed record Options(string Session, string Output, double Threshold)
{
    public static Options Parse(string[] args)
    {
        string? Value(string name) { var i = Array.IndexOf(args, name); return i >= 0 && i + 1 < args.Length ? args[i + 1] : null; }
        var session = Value("--session") ?? throw new ArgumentException("--session is required");
        var output = Value("--output") ?? throw new ArgumentException("--output is required");
        var threshold = double.TryParse(Value("--threshold"), out var parsed) ? parsed : 0.008;
        return new(session, Path.GetFullPath(output), threshold);
    }
}

sealed class VadChunker
{
    private const int MinMs = 1_800, MaxMs = 8_000, SilenceMs = 450, OverlapMs = 600;
    private readonly Options options; private readonly WaveFormat sourceFormat; private readonly object gate = new();
    private readonly MemoryStream buffer = new(); private readonly Stopwatch timeline = Stopwatch.StartNew();
    private int silenceMs; private bool speechSeen; private long chunkStartMs;
    public VadChunker(Options options, WaveFormat sourceFormat) { this.options = options; this.sourceFormat = sourceFormat; }

    public void Add(ReadOnlySpan<byte> bytes)
    {
        lock (gate)
        {
            var frameMs = (int)Math.Max(1, bytes.Length * 1000L / sourceFormat.AverageBytesPerSecond);
            var speech = Rms(bytes) >= options.Threshold;
            if (speech) { speechSeen = true; silenceMs = 0; } else silenceMs += frameMs;
            buffer.Write(bytes);
            var durationMs = (int)(buffer.Length * 1000L / sourceFormat.AverageBytesPerSecond);
            if (!speechSeen && durationMs > OverlapMs) KeepTail(OverlapMs);
            if (speechSeen && durationMs >= MinMs && (silenceMs >= SilenceMs || durationMs >= MaxMs)) Emit(durationMs);
        }
    }

    public void Flush() { lock (gate) { var duration = (int)(buffer.Length * 1000L / sourceFormat.AverageBytesPerSecond); if (speechSeen && duration >= 500) Emit(duration, false); } }

    private void Emit(int durationMs, bool keepOverlap = true)
    {
        var endMs = chunkStartMs + durationMs; var raw = buffer.ToArray();
        var file = Path.Combine(options.Output, $"{options.Session}__{chunkStartMs}__{endMs}.wav");
        using (var source = new RawSourceWaveStream(new MemoryStream(raw), sourceFormat))
        {
            ISampleProvider samples = source.ToSampleProvider();
            if (samples.WaveFormat.Channels == 2) samples = new StereoToMonoSampleProvider(samples) { LeftVolume = 0.5f, RightVolume = 0.5f };
            else if (samples.WaveFormat.Channels > 2) samples = new MultiplexingSampleProvider(new[] { samples }, 1);
            samples = new WdlResamplingSampleProvider(samples, 16_000);
            WaveFileWriter.CreateWaveFile16(file + ".partial", samples);
        }
        File.Move(file + ".partial", file, true);
        Console.WriteLine(file);
        if (keepOverlap) { KeepTail(OverlapMs); chunkStartMs = Math.Max(0, endMs - OverlapMs); }
        else { buffer.SetLength(0); chunkStartMs = endMs; }
        speechSeen = false; silenceMs = 0;
    }

    private void KeepTail(int milliseconds)
    {
        var alignment = sourceFormat.BlockAlign; var wanted = (int)Math.Min(buffer.Length, sourceFormat.AverageBytesPerSecond * milliseconds / 1000L);
        wanted -= wanted % alignment; var data = buffer.ToArray(); buffer.SetLength(0); if (wanted > 0) buffer.Write(data, data.Length - wanted, wanted);
    }

    private double Rms(ReadOnlySpan<byte> data)
    {
        double sum = 0; int count = 0;
        if (sourceFormat.Encoding == WaveFormatEncoding.IeeeFloat && sourceFormat.BitsPerSample == 32)
            for (var i = 0; i + 3 < data.Length; i += 4) { var value = BitConverter.ToSingle(data.Slice(i, 4)); sum += value * value; count++; }
        else if (sourceFormat.BitsPerSample == 16)
            for (var i = 0; i + 1 < data.Length; i += 2) { var value = BitConverter.ToInt16(data.Slice(i, 2)) / 32768.0; sum += value * value; count++; }
        return count == 0 ? 0 : Math.Sqrt(sum / count);
    }
}

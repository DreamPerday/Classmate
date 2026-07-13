from __future__ import annotations

import argparse
import json
import math
import sys
import unicodedata
from pathlib import Path


def configure_utf8_stdio() -> None:
    for name in ("stdin", "stdout", "stderr"):
        stream = getattr(sys, name)
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="strict")


def load_whisper_model(model_name: str, device: str, compute_type: str):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper is not installed; run pip install -r services/ai-worker/requirements.txt", file=sys.stderr)
        raise

    return WhisperModel(model_name, device=device, compute_type=compute_type)


def transcribe_with_model(model, audio_path: Path, language: str) -> dict[str, object]:
    segments, info = model.transcribe(
        audio_path,
        language=language,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        beam_size=5,
        condition_on_previous_text=True,
        word_timestamps=False,
    )
    return {
        "language": info.language,
        "languageProbability": info.language_probability,
        "segments": [
            {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
                "confidence": max(0.0, min(1.0, math.exp(segment.avg_logprob))),
            }
            for segment in segments
            if segment.text.strip()
        ],
    }


def transcribe(args: argparse.Namespace) -> int:
    try:
        model = load_whisper_model(args.model, args.device, args.compute_type)
    except ImportError:
        return 2
    result = transcribe_with_model(model, args.input, args.language)
    json.dump(result, sys.stdout, ensure_ascii=False)
    return 0


def transcribe_server(args: argparse.Namespace) -> int:
    try:
        model = load_whisper_model(args.model, args.device, args.compute_type)
    except ImportError:
        return 2
    for line in sys.stdin:
        request: dict[str, object] | None = None
        try:
            request = json.loads(line)
            result = transcribe_with_model(model, Path(str(request["input"])), args.language)
            response = {"id": request.get("id"), "result": result}
        except Exception as error:
            response = {"id": request.get("id") if request else None, "error": str(error)}
        print(json.dumps(response, ensure_ascii=False), flush=True)
    return 0


def health(_: argparse.Namespace) -> int:
    checks: dict[str, object] = {"python": sys.version.split()[0]}
    try:
        import faster_whisper
        checks["fasterWhisper"] = getattr(faster_whisper, "__version__", "installed")
    except ImportError:
        checks["fasterWhisper"] = None
    try:
        import reportlab
        checks["reportlab"] = reportlab.Version
    except ImportError:
        checks["reportlab"] = None
    try:
        import sentence_transformers
        checks["sentenceTransformers"] = sentence_transformers.__version__
    except ImportError:
        checks["sentenceTransformers"] = None
    checks["ok"] = all(checks.get(key) is not None for key in ("fasterWhisper", "reportlab", "sentenceTransformers"))
    json.dump(checks, sys.stdout, ensure_ascii=False)
    return 0 if checks["ok"] else 1


def embed_server(args: argparse.Namespace) -> int:
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("sentence-transformers is not installed", file=sys.stderr)
        return 2
    device = None if args.device == "auto" else args.device
    model = SentenceTransformer(args.model, device=device)
    stdin = sys.stdin
    stdout = sys.stdout
    for line in stdin:
        try:
            request = json.loads(line)
            texts = [unicodedata.normalize("NFKC", str(value)) for value in request.get("texts", [])]
            vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False).tolist()
            print(json.dumps({"id": request.get("id"), "vectors": vectors}, ensure_ascii=False), file=stdout, flush=True)
        except Exception as error:
            print(json.dumps({"id": request.get("id") if "request" in locals() else None, "error": str(error)}, ensure_ascii=False), file=stdout, flush=True)
    return 0


def export_pdf(args: argparse.Namespace) -> int:
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer
    except ImportError:
        print("reportlab is not installed", file=sys.stderr)
        return 2
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    styles = getSampleStyleSheet()
    body = ParagraphStyle("CJKBody", parent=styles["BodyText"], fontName="STSong-Light", fontSize=11, leading=18, alignment=TA_JUSTIFY, firstLineIndent=22, textColor=colors.HexColor("#2d312e"), spaceAfter=6)
    h1 = ParagraphStyle("CJKH1", parent=body, fontSize=18, leading=25, alignment=TA_CENTER, firstLineIndent=0, spaceBefore=18, spaceAfter=14, textColor=colors.HexColor("#234f41"))
    h2 = ParagraphStyle("CJKH2", parent=body, fontSize=15, leading=22, firstLineIndent=0, spaceBefore=16, spaceAfter=8, textColor=colors.HexColor("#234f41"))
    h3 = ParagraphStyle("CJKH3", parent=body, fontSize=12, leading=19, firstLineIndent=0, spaceBefore=12, spaceAfter=5, textColor=colors.HexColor("#8b4e32"))
    subtitle = ParagraphStyle("Subtitle", parent=body, fontSize=10, leading=16, alignment=TA_CENTER, firstLineIndent=0, textColor=colors.HexColor("#737b75"))
    story = [Spacer(1, 42 * mm), Paragraph(escape(payload["title"]), h1), Spacer(1, 7 * mm), Paragraph(escape(payload.get("subtitle", "")), subtitle), Spacer(1, 4 * mm), Paragraph(escape(payload.get("author", "")), subtitle), PageBreak()]
    for section in payload.get("sections", []):
        style = h1 if section.get("level") == 1 else h2 if section.get("level") == 2 else h3
        story.append(Paragraph(escape(section.get("heading", "")), style))
        for text in section.get("paragraphs", []):
            for line in str(text).split("\n"):
                if line.strip(): story.append(Paragraph(escape(line).replace("• ", "· "), body))
    doc = SimpleDocTemplate(str(args.output), pagesize=A4, rightMargin=24*mm, leftMargin=28*mm, topMargin=24*mm, bottomMargin=22*mm, title=payload["title"], author=payload.get("author", ""))
    def decorate(canvas, document):
        canvas.saveState(); canvas.setFont("STSong-Light", 9); canvas.setFillColor(colors.HexColor("#777d78"));
        if document.page > 1: canvas.drawString(28*mm, A4[1]-15*mm, payload["title"][:32]); canvas.drawCentredString(A4[0]/2, 12*mm, f"- {document.page} -");
        canvas.restoreState()
    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
    return 0


def escape(value: object) -> str:
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main() -> int:
    configure_utf8_stdio()
    parser = argparse.ArgumentParser(description="Local AI worker for Classmate Agent")
    sub = parser.add_subparsers(dest="command", required=True)
    asr = sub.add_parser("transcribe")
    asr.add_argument("--input", type=Path, required=True)
    asr.add_argument("--model", default="large-v3-turbo")
    asr.add_argument("--device", default="auto")
    asr.add_argument("--compute-type", default="auto")
    asr.add_argument("--language", default="zh")
    asr.set_defaults(func=transcribe)
    asr_server = sub.add_parser("transcribe-server")
    asr_server.add_argument("--model", default="large-v3-turbo")
    asr_server.add_argument("--device", default="auto")
    asr_server.add_argument("--compute-type", default="auto")
    asr_server.add_argument("--language", default="zh")
    asr_server.set_defaults(func=transcribe_server)
    status = sub.add_parser("health")
    status.set_defaults(func=health)
    pdf = sub.add_parser("export-pdf")
    pdf.add_argument("--input", type=Path, required=True)
    pdf.add_argument("--output", type=Path, required=True)
    pdf.set_defaults(func=export_pdf)
    embedding = sub.add_parser("embed-server")
    embedding.add_argument("--model", required=True)
    embedding.add_argument("--device", default="auto")
    embedding.set_defaults(func=embed_server)
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

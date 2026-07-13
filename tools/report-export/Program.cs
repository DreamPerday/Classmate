using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using DocumentFormat.OpenXml.Wordprocessing;
using WpPageSize = DocumentFormat.OpenXml.Wordprocessing.PageSize;

var input = Value("--input") ?? throw new ArgumentException("--input is required");
var output = Value("--output") ?? throw new ArgumentException("--output is required");
var payload = JsonSerializer.Deserialize<ReportArtifact>(File.ReadAllText(input), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? throw new InvalidDataException("Invalid report JSON");
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output))!);
Create(payload, output);
using var validationDoc = WordprocessingDocument.Open(output, false);
var errors = new OpenXmlValidator().Validate(validationDoc).Take(20).ToList();
if (errors.Count > 0) { foreach (var error in errors) Console.Error.WriteLine($"{error.Path?.XPath}: {error.Description}"); return 3; }
Console.WriteLine(output);
return 0;

string? Value(string name) { var i = Array.IndexOf(args, name); return i >= 0 && i + 1 < args.Length ? args[i + 1] : null; }

static void Create(ReportArtifact report, string path)
{
    using var doc = WordprocessingDocument.Create(path, WordprocessingDocumentType.Document);
    doc.PackageProperties.Title = report.Title; doc.PackageProperties.Creator = report.Author; doc.PackageProperties.Created = DateTime.UtcNow;
    var main = doc.AddMainDocumentPart(); AddStyles(main); AddSettings(main);
    var body = new Body();
    body.Append(new Paragraph(new ParagraphProperties(new ParagraphStyleId { Val = "Title" }, new SpacingBetweenLines { Before = "2000" }), new Run(new Text(report.Title))));
    body.Append(new Paragraph(new ParagraphProperties(new ParagraphStyleId { Val = "Subtitle" }), new Run(new Text(report.Subtitle))));
    body.Append(new Paragraph(new ParagraphProperties(new ParagraphStyleId { Val = "Subtitle" }), new Run(new Text(report.Author))));
    body.Append(new Paragraph(new Run(new Break { Type = BreakValues.Page })));
    foreach (var section in report.Sections)
    {
        var level = Math.Clamp(section.Level, 1, 3); body.Append(StyledParagraph(section.Heading, $"Heading{level}"));
        foreach (var paragraph in section.Paragraphs)
            foreach (var line in paragraph.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)) body.Append(StyledParagraph(line, line.StartsWith("• ") ? "ListParagraph" : "Normal"));
    }
    var sectPr = new SectionProperties(); AddHeader(main, sectPr, report.Title); AddFooters(main, sectPr);
    sectPr.Append(new WpPageSize { Width = 11906U, Height = 16838U });
    sectPr.Append(new PageMargin { Top = 1360, Bottom = 1250, Left = 1588U, Right = 1360U, Header = 720U, Footer = 720U, Gutter = 0U });
    sectPr.Append(new TitlePage()); body.Append(sectPr); main.Document = new Document(body); main.Document.Save();
}

static Paragraph StyledParagraph(string text, string style) => new(new ParagraphProperties(new ParagraphStyleId { Val = style }), new Run(new Text(text) { Space = SpaceProcessingModeValues.Preserve }));

static void AddStyles(MainDocumentPart main)
{
    var part = main.AddNewPart<StyleDefinitionsPart>(); var styles = new Styles();
    styles.Append(new DocDefaults(new RunPropertiesDefault(new RunPropertiesBaseStyle(new RunFonts { Ascii = "Aptos", HighAnsi = "Aptos", EastAsia = "SimSun", ComplexScript = "Arial" }, new FontSize { Val = "22" }, new FontSizeComplexScript { Val = "22" }, new Languages { Val = "en-US", EastAsia = "zh-CN" })), new ParagraphPropertiesDefault(new ParagraphPropertiesBaseStyle(new SpacingBetweenLines { Line = "360", LineRule = LineSpacingRuleValues.Auto, After = "0" }))));
    styles.Append(new Style(new StyleName { Val = "Normal" }, new PrimaryStyle(), new StyleParagraphProperties(new WidowControl(), new AutoSpaceDE(), new AutoSpaceDN(), new Indentation { FirstLineChars = 200 }, new Justification { Val = JustificationValues.Both }), new StyleRunProperties(new RunFonts { Ascii = "Aptos", HighAnsi = "Aptos", EastAsia = "SimSun" }, new Color { Val = "2D312E" }, new FontSize { Val = "22" })) { Type = StyleValues.Paragraph, StyleId = "Normal", Default = true });
    styles.Append(new Style(new StyleName { Val = "Title" }, new BasedOn { Val = "Normal" }, new NextParagraphStyle { Val = "Subtitle" }, new PrimaryStyle(), new StyleParagraphProperties(new KeepNext(), new SpacingBetweenLines { After = "180", Line = "520", LineRule = LineSpacingRuleValues.Exact }, new Indentation { FirstLineChars = 0 }, new Justification { Val = JustificationValues.Center }, new OutlineLevel { Val = 0 }), new StyleRunProperties(new RunFonts { Ascii = "Aptos Display", HighAnsi = "Aptos Display", EastAsia = "Microsoft YaHei" }, new Bold(), new Color { Val = "234F41" }, new FontSize { Val = "40" })) { Type = StyleValues.Paragraph, StyleId = "Title" });
    styles.Append(new Style(new StyleName { Val = "Subtitle" }, new BasedOn { Val = "Normal" }, new StyleParagraphProperties(new SpacingBetweenLines { After = "120" }, new Indentation { FirstLineChars = 0 }, new Justification { Val = JustificationValues.Center }), new StyleRunProperties(new Color { Val = "737B75" }, new FontSize { Val = "20" })) { Type = StyleValues.Paragraph, StyleId = "Subtitle" });
    for (var level = 1; level <= 3; level++)
    {
        var size = level == 1 ? "32" : level == 2 ? "28" : "24"; var before = level == 1 ? "420" : level == 2 ? "320" : "240";
        styles.Append(new Style(new StyleName { Val = $"heading {level}" }, new BasedOn { Val = "Normal" }, new NextParagraphStyle { Val = "Normal" }, new PrimaryStyle(), new StyleParagraphProperties(new KeepNext(), new KeepLines(), new SpacingBetweenLines { Before = before, After = "120" }, new Indentation { FirstLineChars = 0 }, new OutlineLevel { Val = level - 1 }), new StyleRunProperties(new RunFonts { Ascii = "Aptos Display", HighAnsi = "Aptos Display", EastAsia = "Microsoft YaHei" }, new Bold(), new Color { Val = level == 3 ? "8B4E32" : "234F41" }, new FontSize { Val = size })) { Type = StyleValues.Paragraph, StyleId = $"Heading{level}" });
    }
    styles.Append(new Style(new StyleName { Val = "List Paragraph" }, new BasedOn { Val = "Normal" }, new StyleParagraphProperties(new SpacingBetweenLines { After = "40" }, new Indentation { Left = "420", Hanging = "220", FirstLineChars = 0 })) { Type = StyleValues.Paragraph, StyleId = "ListParagraph" });
    part.Styles = styles; part.Styles.Save();
}

static void AddSettings(MainDocumentPart main)
{
    var part = main.AddNewPart<DocumentSettingsPart>(); part.Settings = new Settings(new Zoom { Percent = "100" }, new CharacterSpacingControl { Val = CharacterSpacingValues.DoNotCompress }, new UpdateFieldsOnOpen { Val = true }); part.Settings.Save();
}

static void AddHeader(MainDocumentPart main, SectionProperties sectPr, string title)
{
    var part = main.AddNewPart<HeaderPart>(); part.Header = new Header(new Paragraph(new ParagraphProperties(new ParagraphBorders(new BottomBorder { Val = BorderValues.Single, Size = 4, Space = 3, Color = "AAB4AD" }), new Justification { Val = JustificationValues.Left }), new Run(new RunProperties(new RunFonts { EastAsia = "Microsoft YaHei" }, new Color { Val = "747C75" }, new FontSize { Val = "18" }), new Text(title)))); part.Header.Save(); sectPr.Append(new HeaderReference { Type = HeaderFooterValues.Default, Id = main.GetIdOfPart(part) });
}

static void AddFooters(MainDocumentPart main, SectionProperties sectPr)
{
    var first = main.AddNewPart<FooterPart>(); first.Footer = new Footer(new Paragraph()); first.Footer.Save(); sectPr.Append(new FooterReference { Type = HeaderFooterValues.First, Id = main.GetIdOfPart(first) });
    var part = main.AddNewPart<FooterPart>(); var p = new Paragraph(new ParagraphProperties(new Justification { Val = JustificationValues.Center })); var props = new RunProperties(new RunFonts { EastAsia = "SimSun" }, new Color { Val = "777D78" }, new FontSize { Val = "18" });
    p.Append(new Run((RunProperties)props.CloneNode(true), new Text("- ") { Space = SpaceProcessingModeValues.Preserve }), new Run((RunProperties)props.CloneNode(true), new FieldChar { FieldCharType = FieldCharValues.Begin }), new Run((RunProperties)props.CloneNode(true), new FieldCode(" PAGE ") { Space = SpaceProcessingModeValues.Preserve }), new Run((RunProperties)props.CloneNode(true), new FieldChar { FieldCharType = FieldCharValues.End }), new Run((RunProperties)props.CloneNode(true), new Text(" -") { Space = SpaceProcessingModeValues.Preserve }));
    part.Footer = new Footer(p); part.Footer.Save(); sectPr.Append(new FooterReference { Type = HeaderFooterValues.Default, Id = main.GetIdOfPart(part) });
}

sealed record ReportArtifact(string Title, string Subtitle, string Author, string GeneratedAt, List<ReportSection> Sections);
sealed record ReportSection(string Heading, int Level, List<string> Paragraphs);

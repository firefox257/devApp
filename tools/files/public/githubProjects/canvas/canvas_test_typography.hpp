// ./canvas_test_typography.hpp
// Test 22: SVG 2 §10 TEXT & TYPOGRAPHY demo + numeric self-test.
// INCLUDED by canvas_test.cpp (single translation unit) - not standalone.
// Relies on the entry file for includes and shared globals (g_typography_canvas,
// g_font). Must be included AFTER canvas_test_svg.hpp (not required, but the
// entry-file order is kept stable).
//
// The DEMO uses the prefetched real font (returns 0 when none is loaded, like
// the Test 8 font demo). The SELF-TEST is fully deterministic: it builds a
// tiny synthetic TrueType face in memory, so it needs no prefetch at all.
#pragma once
// ============================================================================
// TEST 22 - DEMO
// ============================================================================
ag_export(run_typography_demo)
uint32_t run_typography_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 700; height = 1280; }
if (g_typography_canvas) delete g_typography_canvas;
g_typography_canvas = new Canvas2D(width, height);
Canvas2D& c = *g_typography_canvas;
const float s = std::min(width / 700.0f, height / 1280.0f);
const uint32_t bg = rgba(24,28,36,255), tr = rgba(0,0,0,0), guide = rgba(90,90,110,90);
const uint32_t dim = rgba(175,180,195,255), head = rgba(120,200,255,255);
const uint32_t ink = rgba(238,240,248,255), accent = rgba(255,150,90,255), rule = rgba(120,255,190,110);
c.clear(bg);
c.save();
c.scale(s, s);
c.fill_style(tr).stroke_style(guide);
for (int gx = 0; gx <= 700; gx += 50) { Shape2D p; p.mt(gx,0).lt(gx,1280).set_line_width(0.5f); c.path(p); }
for (int gy = 0; gy <= 1280; gy += 50) { Shape2D p; p.mt(0,gy).lt(700,gy).set_line_width(0.5f); c.path(p); }
if (!g_font) { c.restore(); return 0; }
c.font(g_font);
// Labels always use an explicit style so demo state never leaks into them.
auto label = [&](const char* txt, float x, float y, float px, uint32_t col) {
TextStyle st; st.font_size = px;
c.fill_style(col).stroke_style(tr).fill_text(txt, x, y, st);
};
auto section = [&](const char* txt, float y) { label(txt, 30, y, 26, head); };
auto hrule = [&](float x0, float x1, float y) {
Shape2D p; p.mt(x0,y).lt(x1,y).set_line_width(1.0f);
c.fill_style(tr).stroke_style(rule).path(p);
};
auto vrule = [&](float x, float y0, float y1, uint32_t col) {
Shape2D p; p.mt(x,y0).lt(x,y1).set_line_width(1.0f);
c.fill_style(tr).stroke_style(col).path(p);
};
// ---- 1. text-anchor -------------------------------------------------
section("1. text-anchor: start / middle / end", 34);
vrule(350, 46, 176, rgba(255,90,90,170));
{
TextStyle st; st.font_size = 30;
const TextAnchor as[3] = {TextAnchor::Start, TextAnchor::Middle, TextAnchor::End};
const char* nm[3] = {"start", "middle", "end"};
for (int i = 0; i < 3; ++i) {
st.anchor = as[i];
c.fill_style(ink).fill_text("Anchor", 350, 76 + i*40, st);
label(nm[i], 40, 76 + i*40, 20, dim);
}
}
// ---- 2. dominant-baseline -------------------------------------------
section("2. dominant-baseline", 212);
hrule(30, 670, 280);
{
const DominantBaseline bs[5] = {DominantBaseline::Alphabetic, DominantBaseline::Middle,
DominantBaseline::Central, DominantBaseline::Hanging, DominantBaseline::TextTop};
const char* nm[5] = {"alphabetic", "middle", "central", "hanging", "text-top"};
TextStyle st; st.font_size = 26;
for (int i = 0; i < 5; ++i) {
st.baseline = bs[i];
c.fill_style(ink).fill_text("Hxg", 40 + i*130, 280, st);
label(nm[i], 40 + i*130, 318, 15, dim);
}
}
// ---- 3. dx / dy / rotate --------------------------------------------
section("3. dx / dy per glyph, rotate per character", 362);
{
TextStyle st; st.font_size = 28;
st.dx = {0, 4, 8, 12, 16, 20};
c.fill_style(ink).fill_text("OFFSET", 40, 408, st);
label("dx 0 4 8 12 16 20", 400, 408, 17, dim);
st.dx.clear(); st.dy = {0, -10, 0, 10, 0};
c.fill_style(ink).fill_text("WAVE", 40, 460, st);
label("dy 0 -10 0 10 0", 400, 460, 17, dim);
st.dy.clear(); st.rotate = {-30, -18, -6, 6, 18, 30};
c.fill_style(accent).fill_text("ROTATE", 40, 524, st);
st.rotate = {0, 45, 90, 135};
c.fill_style(rgba(190,120,255,255)).fill_text("SPIN", 430, 524, st);
}
// ---- 4. letter-spacing / word-spacing --------------------------------
section("4. letter-spacing / word-spacing", 574);
{
TextStyle st; st.font_size = 26;
const float ls[3] = {0, 6, 14};
for (int i = 0; i < 3; ++i) {
st.letter_spacing = ls[i];
c.fill_style(ink).fill_text("SPACING", 40, 614 + i*36, st);
}
label("ls 0 / 6 / 14", 40, 706, 15, dim);
st.letter_spacing = 0;
const float ws[3] = {0, 12, 28};
for (int i = 0; i < 3; ++i) {
st.word_spacing = ws[i];
c.fill_style(ink).fill_text("a b c", 420, 614 + i*36, st);
}
label("ws 0 / 12 / 28", 420, 706, 15, dim);
}
// ---- 5. font-weight --------------------------------------------------
section("5. font-weight 100..900 (real face or synthetic)", 748);
{
TextStyle st; st.font_size = 28;
const int wts[8] = {100, 300, 400, 500, 600, 700, 800, 900};
for (int i = 0; i < 8; ++i) {
char buf[24]; std::snprintf(buf, sizeof(buf), "Ag %d", wts[i]);
st.font_weight = wts[i];
const float x = 40 + (i % 4) * 160, y = 792 + (i / 4) * 44;
c.fill_style(ink).fill_text(buf, x, y, st);
}
}
// ---- 6. font-style ---------------------------------------------------
section("6. font-style: normal / italic / oblique", 888);
{
TextStyle st; st.font_size = 30;
c.fill_style(ink).fill_text("Normal", 40, 934, st);
st.font_style = FontStyle::Italic;
c.fill_style(ink).fill_text("Italic", 250, 934, st);
st.font_style = FontStyle::Oblique;
c.fill_style(ink).fill_text("Oblique", 450, 934, st);
st.font_style = FontStyle::Italic; st.font_weight = 800; st.letter_spacing = 2;
c.fill_style(accent).fill_text("Bold Italic 800", 40, 978, st);
}
// ---- 7. textLength / lengthAdjust ------------------------------------
section("7. textLength / lengthAdjust", 1020);
{
TextStyle st; st.font_size = 28;
c.fill_style(dim).fill_text("LENGTH", 40, 1064, st);
label("natural", 420, 1064, 17, dim);
vrule(340, 1078, 1152, rgba(255,90,90,170));
st.text_length = 300; st.length_adjust = LengthAdjust::Spacing;
c.fill_style(ink).fill_text("LENGTH", 40, 1106, st);
label("spacing 300", 420, 1106, 17, dim);
st.length_adjust = LengthAdjust::SpacingAndGlyphs;
c.fill_style(accent).fill_text("LENGTH", 40, 1148, st);
label("spacingAndGlyphs 300", 420, 1148, 17, dim);
}
// ---- 8. everything at once (gradient + stroke + shadow + mask + clip) --
section("8. anchored + masked + clipped + gradient + shadow", 1192);
{
LinearGradient* tg = new LinearGradient(120, 1200, 580, 1250);
tg->add_stop(0, rgba(255,90,120,255)).add_stop(0.5f, rgba(255,220,90,255)).add_stop(1, rgba(90,200,255,255));
LinearGradient* mg = new LinearGradient(30, 0, 670, 0);
mg->add_stop(0, rgba(0,0,0,255)).add_stop(0.22f, rgba(255,255,255,255))
.add_stop(0.78f, rgba(255,255,255,255)).add_stop(1, rgba(0,0,0,255));
Shape2D box; box.mt(30,1198).lt(670,1198).lt(670,1266).lt(30,1266).close();
Mask* mk = new Mask();
mk->set_units(Mask::Units::UserSpaceOnUse).set_region(30,1198,640,68).add_shape(box, Paint(mg));
ClipPath* cp = new ClipPath(); cp->add(box);
TextStyle st; st.font_size = 54; st.font_weight = 800; st.font_style = FontStyle::Italic;
st.letter_spacing = 3; st.anchor = TextAnchor::Middle; st.baseline = DominantBaseline::Central;
c.set_mask(mk).set_clip(cp).drop_shadow(4, 4, 3, rgba(0,0,0,200));
c.fill_style(tg).fill_text("TYPOGRAPHY", 350, 1232, st);
c.stroke_style(rgba(255,255,255,170)).stroke_text("TYPOGRAPHY", 350, 1232, st);
c.clear_shadow().clear_mask().clear_clip();
delete cp; delete mk; delete mg; delete tg;
}
c.restore();
c.reset_text_style().fill_style(tr).stroke_style(tr);
return 1;
}
// ============================================================================
// TEST 22b - DETERMINISTIC SYNTHETIC TRUE TYPE FACE
// unitsPerEm 1000, ascender 800, descender -200, x-height 500, cap-height 700.
// At set_pixel_height(100) the scale is exactly 0.1, so:
//   'A'/'B' advance = ADV*0.1, ink box x[10,50] y[baseline-70, baseline]
//   space advance = 30, ascent 80, descent -20, x-height 50, cap-height 70.
// ADV differs per variant so face selection is observable through measure:
//   regular 600, bold 700, italic 650, bold-italic 750.
// ============================================================================
struct TTWriter {
std::vector<unsigned char> b;
void u8(unsigned v) { b.push_back((unsigned char)(v & 0xFFu)); }
void u16(unsigned v) { u8(v >> 8); u8(v); }
void i16(int v) { u16((unsigned)v & 0xFFFFu); }
void u32(unsigned long v) { u8((unsigned)(v >> 24)); u8((unsigned)(v >> 16)); u8((unsigned)(v >> 8)); u8((unsigned)v); }
void tag(const char* t) { for (int i = 0; i < 4; ++i) u8((unsigned char)t[i]); }
void zeros(size_t n) { for (size_t i = 0; i < n; ++i) u8(0); }
void pad() { while (b.size() & 3u) u8(0); }
};
typedef std::pair<const char*, std::vector<unsigned char> > TTTable;
static std::vector<unsigned char> tt_assemble(std::vector<TTTable>& tabs) {
std::sort(tabs.begin(), tabs.end(), [](const TTTable& a, const TTTable& b) { return std::strncmp(a.first, b.first, 4) < 0; });
TTWriter out;
out.u32(0x00010000);
const unsigned n = (unsigned)tabs.size();
unsigned p = 1, e = 0;
while (p * 2 <= n) { p *= 2; ++e; }
out.u16(n); out.u16(p * 16); out.u16(e); out.u16(n * 16 - p * 16);
unsigned off = 12 + 16 * n;
for (size_t i = 0; i < tabs.size(); ++i) {
out.tag(tabs[i].first); out.u32(0); out.u32(off); out.u32((unsigned)tabs[i].second.size());
off += (unsigned)((tabs[i].second.size() + 3) & ~size_t(3));
}
for (size_t i = 0; i < tabs.size(); ++i) {
out.b.insert(out.b.end(), tabs[i].second.begin(), tabs[i].second.end());
out.pad();
}
return out.b;
}
static std::vector<unsigned char> build_typography_font(int weight, bool italic) {
const bool bold = (weight >= 600);
const int adv = bold ? (italic ? 750 : 700) : (italic ? 650 : 600);
std::vector<TTTable> tabs;
// ---- head (54) ----
{
TTWriter t;
t.u32(0x00010000); t.u32(0x00010000); t.u32(0); t.u32(0x5F0F3CF5);
t.u16(0x000B); t.u16(1000);
t.zeros(8); t.zeros(8);
t.i16(0); t.i16(0); t.i16(600); t.i16(700);
t.u16((italic ? 2u : 0u) | (bold ? 1u : 0u));
t.u16(8); t.i16(2); t.i16(1); t.i16(0);
tabs.push_back(TTTable("head", t.b));
}
// ---- hhea (36) ----
{
TTWriter t;
t.u32(0x00010000);
t.i16(800); t.i16(-200); t.i16(0);
t.u16((unsigned)adv); t.i16(0); t.i16(0); t.i16(500);
t.i16(1); t.i16(0); t.i16(0);
t.zeros(8); t.i16(0); t.u16(4);
tabs.push_back(TTTable("hhea", t.b));
}
// ---- maxp (32) ----
{
TTWriter t; t.u32(0x00010000); t.u16(4); t.zeros(26);
tabs.push_back(TTTable("maxp", t.b));
}
// ---- hmtx (16) ----
{
TTWriter t;
t.u16(500); t.i16(0);
t.u16(300); t.i16(0);
t.u16((unsigned)adv); t.i16(100);
t.u16((unsigned)adv); t.i16(100);
tabs.push_back(TTTable("hmtx", t.b));
}
// ---- cmap (52): format 4, segments 0x20, 0x41-0x42, 0xFFFF ----
{
TTWriter t;
t.u16(0); t.u16(1);
t.u16(3); t.u16(1); t.u32(12);
t.u16(4); t.u16(40); t.u16(0);
t.u16(6); t.u16(4); t.u16(1); t.u16(2);
t.u16(0x20); t.u16(0x42); t.u16(0xFFFF);
t.u16(0);
t.u16(0x20); t.u16(0x41); t.u16(0xFFFF);
t.i16(-31); t.i16(-63); t.i16(1);
t.u16(0); t.u16(0); t.u16(0);
tabs.push_back(TTTable("cmap", t.b));
}
// ---- glyf (68): two identical 34-byte rectangles ----
{
TTWriter t;
for (int g = 0; g < 2; ++g) {
t.i16(1);
t.i16(100); t.i16(0); t.i16(500); t.i16(700);
t.u16(3); t.u16(0);
t.u8(1); t.u8(1); t.u8(1); t.u8(1);
t.i16(100); t.i16(400); t.i16(0); t.i16(-400);
t.i16(0); t.i16(0); t.i16(700); t.i16(-700);
}
tabs.push_back(TTTable("glyf", t.b));
}
// ---- loca (20, long format): glyphs 0/1 empty, 2/3 the boxes ----
{
TTWriter t;
t.u32(0); t.u32(0); t.u32(0); t.u32(34); t.u32(68);
tabs.push_back(TTTable("loca", t.b));
}
// ---- OS/2 version 4 (96) ----
{
TTWriter t;
t.u16(4); t.i16(600);
t.u16((unsigned)weight); t.u16(5); t.u16(0);
t.zeros(20);                       // 10..29 sub/super/strike
t.i16(0);                          // 30 sFamilyClass
t.zeros(10);                       // 32 panose
t.zeros(16);                       // 42 unicode ranges
t.tag("TEST");                     // 58 achVendID
t.u16((italic ? 1u : 0u) | (bold ? 0x20u : 0u) | ((!italic && !bold) ? 0x40u : 0u)); // 62
t.u16(0x20); t.u16(0x42);          // 64/66 first/last char
t.i16(800); t.i16(-200); t.i16(0); // 68/70/72 typo
t.u16(800); t.u16(200);            // 74/76 win
t.u32(0); t.u32(0);                // 78/82 code pages
t.i16(500); t.i16(700);            // 86/88 sxHeight / sCapHeight
t.u16(0); t.u16(0x20); t.u16(1);   // 90/92/94
tabs.push_back(TTTable("OS/2", t.b));
}
return tt_assemble(tabs);
}
// ============================================================================
// TEST 22b - NUMERIC TYPOGRAPHY SELF-TEST (returns failure count, 0 = pass)
// ============================================================================
static uint32_t g_typography_selftest_checks = 0;
ag_export(run_typography_selftest)
uint32_t run_typography_selftest() {
uint32_t fails = 0, checks = 0;
auto eqf = [&](float got, float want, float tol, const char* name) {
++checks;
if (!(std::fabs(got - want) <= tol)) {
++fails;
std::printf("[typography self-test] FAIL %s: got %.3f, want %.3f (+/-%.3f)\n", name, got, want, tol);
}
};
auto eqi = [&](int got, int want, const char* name) {
++checks;
if (got != want) { ++fails; std::printf("[typography self-test] FAIL %s: got %d, want %d\n", name, got, want); }
};
auto ink = [](Canvas2D& c, int x, int y) -> int {
if (x < 0 || y < 0 || x >= c.get_width() || y >= c.get_height()) return 0;
return (c.get_buffer()[(size_t)y * c.get_width() + x] >> 24) > 127 ? 1 : 0;
};
auto ink_count = [](Canvas2D& c) -> int {
int n = 0; const size_t total = (size_t)c.get_width() * c.get_height();
for (size_t i = 0; i < total; ++i) if ((c.get_buffer()[i] >> 24) > 127) ++n;
return n;
};
const uint32_t white = rgba(255,255,255,255), tr = rgba(0,0,0,0);
// ---- build the deterministic faces ----
std::vector<unsigned char> reg_data = build_typography_font(400, false);
std::vector<unsigned char> bold_data = build_typography_font(700, false);
std::vector<unsigned char> ital_data = build_typography_font(400, true);
std::vector<unsigned char> bi_data = build_typography_font(700, true);
Font fre, fbo, fit, fbi;
const bool ok = fre.load(reg_data.data(), reg_data.size(), 100.0f)
&& fbo.load(bold_data.data(), bold_data.size(), 100.0f)
&& fit.load(ital_data.data(), ital_data.size(), 100.0f)
&& fbi.load(bi_data.data(), bi_data.size(), 100.0f);
eqi(ok ? 1 : 0, 1, "synthetic faces load");
if (!ok) { g_typography_selftest_checks = checks; return fails; }
// ---- 0. Font OS/2 / head parsing (SVG 2 §10.2 face description) ----
eqi(fre.weight_class(), 400, "regular usWeightClass");
eqi(fbo.weight_class(), 700, "bold usWeightClass");
eqi(fre.is_italic() ? 1 : 0, 0, "regular not italic");
eqi(fit.is_italic() ? 1 : 0, 1, "italic fsSelection");
eqi(fbo.is_bold() ? 1 : 0, 1, "bold fsSelection");
eqi(fre.units_per_em(), 1000, "unitsPerEm");
eqf(fre.get_pixel_height(), 100.0f, 0.01f, "pixel height round-trip");
{
Font::VMetrics v = fre.get_vmetrics();
eqf(v.ascent, 80.0f, 0.01f, "ascent px");
eqf(v.descent, -20.0f, 0.01f, "descent px");
eqf(v.x_height, 50.0f, 0.01f, "x-height px");
eqf(v.cap_height, 70.0f, 0.01f, "cap-height px");
eqf(fre.get_char_advance('A'), 60.0f, 0.01f, "advance A");
eqf(fre.get_char_advance(' '), 30.0f, 0.01f, "advance space");
eqf(fre.get_kerning('A', 'B'), 0.0f, 0.001f, "no kern table");
}
Canvas2D c(400, 220);
c.font(&fre).fill_style(white).stroke_style(tr);
// ---- 1. defaults / measure / text_box ----
eqf(c.measure_text("AB"), 120.0f, 0.01f, "natural advance");
eqf(c.measure_text(""), 0.0f, 0.001f, "empty advance");
eqf(c.measure_text(nullptr), 0.0f, 0.001f, "null advance");
{
Canvas2D::TextBox b = c.text_box("AB", 200, 100);
eqf(b.advance, 120.0f, 0.01f, "box advance");
eqf(b.x0, 200.0f, 0.01f, "box x0");
eqf(b.x1, 320.0f, 0.01f, "box x1");
eqf(b.y0, 20.0f, 0.01f, "box y0 (ascent)");
eqf(b.y1, 120.0f, 0.01f, "box y1 (descent)");
eqf(b.baseline, 100.0f, 0.01f, "box baseline");
eqi((int)b.glyphs, 2, "box glyph count");
}
// ---- 2. text-anchor ----
{
const TextAnchor as[3] = {TextAnchor::Start, TextAnchor::Middle, TextAnchor::End};
const float shift[3] = {0.0f, -60.0f, -120.0f};
for (int i = 0; i < 3; ++i) {
TextStyle st; st.anchor = as[i];
Canvas2D d(400, 220); d.clear(0); d.font(&fre).fill_style(white).stroke_style(tr);
d.fill_text("AB", 200, 100, st);
eqf(d.text_box("AB", 200, 100, st).x0, 200.0f + shift[i], 0.01f, "anchor box origin");
eqi(ink(d, (int)(215 + shift[i]), 60), 1, "anchor glyph A ink");
eqi(ink(d, (int)(265 + shift[i]), 60), 0, "anchor inter-glyph gap");
eqi(ink(d, (int)(305 + shift[i]), 60), 1, "anchor glyph B ink");
}
Canvas2D d(400, 220); d.clear(0); d.font(&fre).fill_style(white);
TextStyle st; st.anchor = TextAnchor::End;
d.fill_text("AB", 200, 100, st);
eqi(ink(d, 215, 60), 0, "end anchor moved off start position");
}
// ---- 3. dominant-baseline ----
{
struct BL { DominantBaseline b; float off; const char* n; };
const BL bl[] = {
{DominantBaseline::Auto, 0.0f, "auto"},
{DominantBaseline::Alphabetic, 0.0f, "alphabetic"},
{DominantBaseline::Ideographic, 0.0f, "ideographic"},
{DominantBaseline::Middle, 25.0f, "middle"},
{DominantBaseline::Mathematical, 25.0f, "mathematical"},
{DominantBaseline::Central, 30.0f, "central"},
{DominantBaseline::Hanging, 64.0f, "hanging"},
{DominantBaseline::TextTop, 80.0f, "text-top"},
{DominantBaseline::TextBeforeEdge, 80.0f, "text-before-edge"},
{DominantBaseline::TextBottom, -20.0f, "text-bottom"},
{DominantBaseline::TextAfterEdge, -20.0f, "text-after-edge"}
};
for (int i = 0; i < 11; ++i) {
TextStyle st; st.baseline = bl[i].b; st.font_size = 100;
Canvas2D d(200, 220); d.clear(0); d.font(&fre).fill_style(white);
d.fill_text("A", 50, 100, st);
eqf(d.text_box("A", 50, 100, st).baseline, 100.0f + bl[i].off, 0.01f, bl[i].n);
const float top = 100.0f + bl[i].off - 70.0f, bot = 100.0f + bl[i].off;
eqi(ink(d, 70, (int)(top + 5)), 1, "baseline ink top inside");
eqi(ink(d, 70, (int)(bot - 5)), 1, "baseline ink bottom inside");
eqi(ink(d, 70, (int)(top - 5)), 0, "baseline ink above");
eqi(ink(d, 70, (int)(bot + 5)), 0, "baseline ink below");
}
}
// ---- 4. letter-spacing ----
{
TextStyle st; st.letter_spacing = 10;
eqf(c.measure_text("AB", st), 140.0f, 0.01f, "letter-spacing advance");
Canvas2D d(200, 220); d.clear(0); d.font(&fre).fill_style(white);
d.fill_text("AB", 0, 100, st);
eqi(ink(d, 125, 60), 0, "letter-spacing opens a gap");
eqi(ink(d, 135, 60), 1, "letter-spacing shifts glyph B");
Canvas2D e(200, 220); e.clear(0); e.font(&fre).fill_style(white);
e.fill_text("AB", 0, 100);
eqi(ink(e, 125, 60), 1, "no spacing: glyph B at natural position");
}
// ---- 5. word-spacing ----
{
TextStyle st;
eqf(c.measure_text("A B", st), 150.0f, 0.01f, "word natural advance");
st.word_spacing = 20;
eqf(c.measure_text("A B", st), 170.0f, 0.01f, "word-spacing advance");
Canvas2D d(240, 220); d.clear(0); d.font(&fre).fill_style(white);
d.fill_text("A B", 0, 100, st);
eqi(ink(d, 150, 60), 1, "word-spacing pushes B right");
Canvas2D e(240, 220); e.clear(0); e.font(&fre).fill_style(white);
e.fill_text("A B", 0, 100);
eqi(ink(e, 150, 60), 0, "no word-spacing: B is left of 150");
st.word_spacing = 0; st.letter_spacing = 5;
eqf(c.measure_text("A B", st), 165.0f, 0.01f, "letter+word spacing add up");
}
// ---- 6. dx / dy (cumulative) ----
{
TextStyle st; st.dx = {0, 20};
Canvas2D d(240, 220); d.clear(0); d.font(&fre).fill_style(white);
d.fill_text("AB", 0, 100, st);
eqi(ink(d, 85, 60), 0, "dx opens a gap before B");
eqi(ink(d, 100, 60), 1, "dx shifts B");
eqf(c.measure_text("AB", st), 140.0f, 0.01f, "dx contributes to the advance");
TextStyle sc; sc.dx = {20, 0, 0};
eqf(c.measure_text("AAB", sc), 200.0f, 0.01f, "dx is cumulative");
Canvas2D e(240, 220); e.clear(0); e.font(&fre).fill_style(white);
e.fill_text("AAB", 0, 100, sc);
eqi(ink(e, 15, 60), 0, "cumulative dx: first glyph shifted");
eqi(ink(e, 35, 60), 1, "cumulative dx: first glyph ink");
eqi(ink(e, 155, 60), 1, "cumulative dx: last glyph shifted");
TextStyle sy; sy.dy = {0, -30};
Canvas2D f(240, 220); f.clear(0); f.font(&fre).fill_style(white);
f.fill_text("AB", 0, 100, sy);
eqi(ink(f, 80, 85), 0, "dy lifts glyph B");
eqi(ink(f, 80, 40), 1, "dy lifted glyph B ink");
eqi(ink(f, 20, 85), 1, "dy leaves glyph A alone");
}
// ---- 7. rotate (per character, last value repeats) ----
{
TextStyle st; st.rotate = {90};
Canvas2D d(400, 220); d.clear(0); d.font(&fre).fill_style(white);
d.fill_text("A", 100, 100, st);
eqi(ink(d, 135, 130), 1, "rotate 90 ink");
eqi(ink(d, 135, 60), 0, "rotate 90 leaves the unrotated box");
Canvas2D e(400, 220); e.clear(0); e.font(&fre).fill_style(white);
e.fill_text("AB", 100, 100, st);
eqi(ink(e, 235, 130), 1, "rotate list repeats for glyph B");
eqi(ink(e, 195, 60), 0, "glyph B is not upright");
}
// ---- 8. textLength / lengthAdjust ----
{
TextStyle st; st.text_length = 200; st.length_adjust = LengthAdjust::Spacing;
eqf(c.measure_text("AB", st), 200.0f, 0.01f, "textLength spacing advance");
Canvas2D d(300, 220); d.clear(0); d.font(&fre).fill_style(white);
d.fill_text("AB", 0, 100, st);
eqi(ink(d, 100, 60), 0, "spacing: gap widened");
eqi(ink(d, 160, 60), 1, "spacing: glyph B moved");
eqi(ink(d, 30, 60), 1, "spacing: glyph A unchanged");
TextStyle sg; sg.text_length = 240; sg.length_adjust = LengthAdjust::SpacingAndGlyphs;
eqf(c.measure_text("AB", sg), 240.0f, 0.01f, "textLength glyphs advance");
Canvas2D e(300, 220); e.clear(0); e.font(&fre).fill_style(white);
e.fill_text("AB", 0, 100, sg);
eqi(ink(e, 90, 60), 1, "spacingAndGlyphs stretches glyph A");
eqi(ink(e, 110, 60), 0, "spacingAndGlyphs gap");
eqi(ink(e, 150, 60), 1, "spacingAndGlyphs moves+stretches B");
TextStyle z; z.text_length = 0;
eqf(c.measure_text("AB", z), 0.0f, 0.001f, "textLength 0 advance");
Canvas2D f(300, 220); f.clear(0); f.font(&fre).fill_style(white);
f.fill_text("AB", 0, 100, z);
eqi(ink_count(f), 0, "textLength 0 renders nothing");
TextStyle one; one.text_length = 200;
eqf(c.measure_text("A", one), 60.0f, 0.01f, "single glyph spacing adjust is a no-op");
TextStyle ae; ae.text_length = 200; ae.anchor = TextAnchor::End;
eqf(c.text_box("AB", 300, 100, ae).x0, 100.0f, 0.01f, "anchor uses the adjusted length");
}
// ---- 9. font-weight (synthetic emboldening) ----
{
TextStyle w4, w7, w9;
w4.font_weight = 400; w7.font_weight = 700; w9.font_weight = 900;
eqf(c.measure_text("AB", w7), 120.0f, 0.01f, "synthetic bold keeps advances");
Canvas2D a(200, 220), b(200, 220), d(200, 220);
a.clear(0); b.clear(0); d.clear(0);
a.font(&fre).fill_style(white).fill_text("A", 0, 100, w4);
b.font(&fre).fill_style(white).fill_text("A", 0, 100, w7);
d.font(&fre).fill_style(white).fill_text("A", 0, 100, w9);
const int na = ink_count(a), nb = ink_count(b), nd = ink_count(d);
eqi(nb > na ? 1 : 0, 1, "weight 700 adds ink");
eqi(nd > nb ? 1 : 0, 1, "weight 900 adds more ink");
eqi(ink(a, 8, 60), 0, "regular outline edge");
eqi(ink(d, 8, 60), 1, "weight 900 emboldens outwards");
// stroke_text emboldening thickens the outline too
Canvas2D s1(200, 220), s2(200, 220);
s1.clear(0); s2.clear(0);
s1.font(&fre).fill_style(tr).stroke_style(white).stroke_text("A", 0, 100, w4);
s2.font(&fre).fill_style(tr).stroke_style(white).stroke_text("A", 0, 100, w9);
eqi(ink_count(s2) > ink_count(s1) ? 1 : 0, 1, "bold stroke_text is thicker");
// the context dash must NOT leak into the emboldening pass
Canvas2D dash(200, 220); dash.clear(0);
dash.font(&fre).fill_style(white).set_line_dash({2, 6}).fill_text("A", 0, 100, w9);
eqi(ink(dash, 30, 60), 1, "bold fill ignores the context dash");
}
// ---- 10. font-style (synthetic oblique) ----
{
TextStyle it; it.font_style = FontStyle::Italic;
Canvas2D a(200, 220), b(200, 220);
a.clear(0); b.clear(0);
a.font(&fre).fill_style(white).fill_text("A", 0, 100);
b.font(&fre).fill_style(white).fill_text("A", 0, 100, it);
eqi(ink(a, 60, 35), 0, "upright top edge");
eqi(ink(b, 60, 35), 1, "italic leans the top right");
eqi(ink(b, 60, 95), 0, "italic barely shifts the baseline");
eqi(ink(b, 20, 95), 1, "italic keeps the baseline ink");
TextStyle ob; ob.font_style = FontStyle::Oblique;
Canvas2D d(200, 220); d.clear(0); d.font(&fre).fill_style(white).fill_text("A", 0, 100, ob);
eqi(ink(d, 60, 35), 1, "oblique == italic synthesis");
eqf(c.measure_text("A", it), 60.0f, 0.01f, "italic keeps advances");
}
// ---- 11. real face selection (FontSet) ----
{
Canvas2D d(400, 220);
d.font_variants(&fre, &fbo, &fit, &fbi);
eqf(d.measure_text("AB"), 120.0f, 0.01f, "set: default regular");
TextStyle w7; w7.font_weight = 700;
eqf(d.measure_text("AB", w7), 140.0f, 0.01f, "set: bold face selected");
TextStyle i4; i4.font_style = FontStyle::Italic;
eqf(d.measure_text("AB", i4), 130.0f, 0.01f, "set: italic face selected");
TextStyle bi; bi.font_weight = 700; bi.font_style = FontStyle::Italic;
eqf(d.measure_text("AB", bi), 150.0f, 0.01f, "set: bold-italic face selected");
TextStyle w5; w5.font_weight = 500;
eqf(d.measure_text("AB", w5), 120.0f, 0.01f, "set: weight 500 -> regular");
TextStyle w6; w6.font_weight = 600;
eqf(d.measure_text("AB", w6), 140.0f, 0.01f, "set: weight 600 -> bold");
// a real italic face must NOT get the synthetic shear
Canvas2D e(200, 220); e.clear(0); e.font_variants(&fre, &fbo, &fit, &fbi);
e.fill_style(white).fill_text("A", 0, 100, i4);
eqi(ink(e, 60, 35), 0, "real italic face is not double-slanted");
eqi(ink(e, 20, 35), 1, "real italic face renders upright box");
d.clear_font_variants();
eqf(d.measure_text("AB", w7), 120.0f, 0.01f, "cleared set falls back to font()");
}
// ---- 12. font_size (never mutates the shared Font) ----
{
TextStyle st; st.font_size = 50;
eqf(c.measure_text("AB", st), 60.0f, 0.01f, "font_size halves the advance");
eqf(fre.get_pixel_height(), 100.0f, 0.01f, "font_size leaves the face untouched");
Canvas2D d(200, 220); d.clear(0); d.font(&fre).fill_style(white);
d.fill_text("A", 0, 100, st);
eqi(ink(d, 15, 80), 1, "font_size scales the outline");
eqi(ink(d, 40, 40), 0, "font_size shrinks the outline");
eqf(d.text_box("A", 0, 100, st).y0, 60.0f, 0.01f, "font_size scales the ascent");
}
// ---- 13. text_path / CTM / stroke integration ----
{
Shape2D p0 = c.text_path("A", 100, 100);
TextStyle en; en.anchor = TextAnchor::End;
Shape2D p1 = c.text_path("A", 100, 100, en);
eqi(p0.commands.empty() ? 0 : 1, 1, "text_path has commands");
eqf(p0.commands[0].x1 - p1.commands[0].x1, 60.0f, 0.01f, "text_path honours the anchor");
eqf(p0.commands[0].y1, 100.0f, 0.01f, "text_path flips font y");
Canvas2D d(200, 220); d.clear(0); d.font(&fre).fill_style(white);
d.save(); d.translate(50, 0); d.scale(1.0f, 1.0f);
TextStyle st; st.anchor = TextAnchor::Middle;
d.fill_text("AB", 100, 100, st);
d.restore();
eqi(ink(d, 105, 60), 1, "anchored text follows the CTM");
eqi(ink(d, 55, 60), 0, "CTM shift applied once");
// dashed stroke_text still dashes (context dash reaches the stroke pass)
Canvas2D e(200, 220); e.clear(0); e.font(&fre).fill_style(tr).stroke_style(white);
e.set_line_dash({3, 9}).stroke_text("A", 0, 100);
const int dashed = ink_count(e);
Canvas2D f(200, 220); f.clear(0); f.font(&fre).fill_style(tr).stroke_style(white);
f.stroke_text("A", 0, 100);
eqi(dashed < ink_count(f) ? 1 : 0, 1, "stroke_text keeps context dashes");
}
// ---- 14. mask / clip / gradient integration ----
{
Shape2D right; right.mt(100,0).lt(200,0).lt(200,220).lt(100,220).close();
ClipPath* cp = new ClipPath(); cp->add(right);
Canvas2D d(200, 220); d.clear(0); d.font(&fre).fill_style(white);
TextStyle st; st.anchor = TextAnchor::Middle;
d.set_clip(cp).fill_text("AB", 100, 100, st);
d.clear_clip();
eqi(ink(d, 60, 60), 0, "anchored text clipped left");
eqi(ink(d, 120, 60), 1, "anchored text visible right");
delete cp;
Shape2D half; half.mt(0,0).lt(200,0).lt(200,220).lt(0,220).close();
Mask* mk = new Mask();
mk->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,200,220)
.add_shape(half, Paint(rgba(255,255,255,128)));
Canvas2D e(200, 220); e.clear(0); e.font(&fre).fill_style(white);
e.set_mask(mk).fill_text("A", 0, 100, st);
e.clear_mask();
const int a = (int)(e.get_buffer()[60*200+20] >> 24);
eqi(a > 110 && a < 145 ? 1 : 0, 1, "masked text alpha");
delete mk;
}
// ---- 15. save/restore covers the whole typography state ----
{
Canvas2D d(10, 10);
eqi((int)d.text_anchor(), (int)TextAnchor::Start, "default anchor");
eqi((int)d.dominant_baseline(), (int)DominantBaseline::Auto, "default baseline");
eqi(d.font_weight(), 400, "default weight");
eqi((int)d.font_style(), (int)FontStyle::Normal, "default style");
eqi((int)d.length_adjust(), (int)LengthAdjust::Spacing, "default lengthAdjust");
eqf(d.letter_spacing(), 0.0f, 0.001f, "default letter-spacing");
eqf(d.text_length(), -1.0f, 0.001f, "default textLength unset");
d.save();
d.text_anchor(TextAnchor::End).dominant_baseline(DominantBaseline::Central)
.font_weight(800).font_style(FontStyle::Italic).font_size(33.0f)
.letter_spacing(4).word_spacing(9).text_length(120)
.length_adjust(LengthAdjust::SpacingAndGlyphs)
.text_dx({1,2}).text_dy({3,4}).text_rotate({5,6});
d.save();
d.reset_text_style();
eqi((int)d.text_anchor(), (int)TextAnchor::Start, "reset_text_style");
eqi(d.text_dx().empty() ? 1 : 0, 1, "reset clears dx");
d.restore();
eqi((int)d.text_anchor(), (int)TextAnchor::End, "restore anchor");
eqi((int)d.dominant_baseline(), (int)DominantBaseline::Central, "restore baseline");
eqi(d.font_weight(), 800, "restore weight");
eqi((int)d.font_style(), (int)FontStyle::Italic, "restore style");
eqf(d.font_size(), 33.0f, 0.001f, "restore font_size");
eqf(d.letter_spacing(), 4.0f, 0.001f, "restore letter-spacing");
eqf(d.word_spacing(), 9.0f, 0.001f, "restore word-spacing");
eqf(d.text_length(), 120.0f, 0.001f, "restore textLength");
eqi((int)d.length_adjust(), (int)LengthAdjust::SpacingAndGlyphs, "restore lengthAdjust");
eqi((int)d.text_dx().size(), 2, "restore dx list");
eqi((int)d.text_dy().size(), 2, "restore dy list");
eqi((int)d.text_rotate().size(), 2, "restore rotate list");
d.restore();
eqi((int)d.text_anchor(), (int)TextAnchor::Start, "outer restore anchor");
eqi(d.font_weight(), 400, "outer restore weight");
eqi(d.text_dx().empty() ? 1 : 0, 1, "outer restore clears dx");
eqf(d.font_size(), 0.0f, 0.001f, "outer restore font_size");
// FontSet is part of the state too
d.save(); d.font_variants(&fre, &fbo, &fit, &fbi);
eqi(d.font_set().bold == &fbo ? 1 : 0, 1, "font_set stored");
d.restore();
eqi(d.font_set().empty() ? 1 : 0, 1, "restore pops font_set");
}
// ---- 16. no font / empty text are safe ----
{
Canvas2D d(20, 20); d.clear(0);
eqf(d.measure_text("AB"), 0.0f, 0.001f, "no font measure");
d.fill_style(white).fill_text("AB", 0, 10);
d.stroke_style(white).stroke_text("AB", 0, 10);
eqi(ink_count(d), 0, "no font draws nothing");
d.font(&fre);
d.fill_text(nullptr, 0, 10);
d.fill_text("", 0, 10);
eqi(ink_count(d), 0, "null/empty text draws nothing");
eqi(d.text_path("", 0, 0).commands.empty() ? 1 : 0, 1, "empty text_path");
}
g_typography_selftest_checks = checks;
std::printf("[typography self-test] %u/%u checks passed\n", checks - fails, checks);
return fails;
}
ag_export(get_typography_selftest_checks) uint32_t get_typography_selftest_checks() { return g_typography_selftest_checks; }
// ./canvas_test_globalalpha.hpp
// Test 23: Canvas2D globalAlpha state property demo + numeric self-tests.
// INCLUDED by canvas_test.cpp (single translation unit) - not standalone.
// Must be included AFTER canvas_test_svg.hpp: reuses mask_box/mask_disc,
// the mk_mask/mk_clip/mk_lin/mk_rad heap pools and the pool resets.
//
// Semantics under test (HTML Canvas2D globalAlpha):
//   * multiplies the SOURCE alpha of every draw: fill, stroke, dash,
//     gradient, pattern, image/pixels, text, shadow (coverage x paint x ga)
//   * masks/clips multiply ON TOP; mask CONTENT renders at ga = 1
//   * feeds the composite operator (copy/source-in/... see the alpha;
//     ga = 0 + destination-in still clears; clear ignores ga)
//   * save()/restore() covers it; invalid setter values are ignored
//   * clear() is a raw buffer reset (like HTML clearRect) and ignores ga
#pragma once
static uint32_t g_globalalpha_selftest_checks = 0;
ag_export(run_globalalpha_demo)
uint32_t run_globalalpha_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 700; height = 980; }
if (g_globalalpha_canvas) delete g_globalalpha_canvas;
g_globalalpha_canvas = new Canvas2D(width, height);
Canvas2D& c = *g_globalalpha_canvas;
mask_pool_reset();
clip_pool_reset();
const float s = std::min(width / 700.0f, height / 980.0f);
const uint32_t bg = rgba(24,28,36,255), tr = rgba(0,0,0,0), guide = rgba(90,90,110,90);
const uint32_t dim = rgba(175,180,195,255), head = rgba(120,200,255,255), white = rgba(255,255,255,255);
const float TW = 200.0f, TH = 90.0f, CX[3] = {30.0f, 250.0f, 470.0f};
c.clear(bg);
c.save();
c.scale(s, s);
c.fill_style(tr).stroke_style(guide);
for (int gx = 0; gx <= 700; gx += 50) { Shape2D p; p.mt(gx,0).lt(gx,980).set_line_width(0.5f); c.path(p); }
for (int gy = 0; gy <= 980; gy += 50) { Shape2D p; p.mt(0,gy).lt(700,gy).set_line_width(0.5f); c.path(p); }
auto label = [&](const char* txt, float x, float y, float px, uint32_t col) {
if (!g_font) return;
g_font->set_pixel_height(px);
c.font(g_font).fill_style(col).stroke_style(tr).fill_text(txt, x, y);
};
auto section = [&](const char* txt, float y) { label(txt, 30, y, 26, head); };
auto checker = [&](float x, float y, float w, float h) {
const int cell = 12;
for (int yy = 0; yy < h; yy += cell) for (int xx = 0; xx < w; xx += cell) {
Shape2D p = mask_box(x + xx, y + yy, std::min((float)cell, w - xx), std::min((float)cell, h - yy));
c.fill_style((((xx / cell) + (yy / cell)) % 2 == 0) ? rgba(72,76,92,255) : rgba(46,50,62,255)).stroke_style(tr).path(p);
}
};
auto rainbow = [&](float x, float y, float w) {
LinearGradient* g = mk_lin(x, y, x + w, y);
g->add_stop(0.0f, rgba(255,70,70,255)).add_stop(0.5f, rgba(255,220,70,255)).add_stop(1.0f, rgba(70,160,255,255));
return g;
};
// ---- 1. fill ramp ----
section("1. globalAlpha: fill ramp", 34);
{
const float y = 48;
const float vals[3] = {1.0f, 0.5f, 0.0f};
const char* lbl[3] = {"1.0 (default)", "0.5", "0.0 (invisible)"};
for (int i = 0; i < 3; ++i) {
checker(CX[i], y, TW, TH);
Shape2D r = mask_box(CX[i], y, TW, TH);
c.save();
c.global_alpha(vals[i]).fill_style(rgba(255,140,60,255)).stroke_style(tr).path(r);
c.restore();
label(lbl[i], CX[i], y + TH + 20, 19, dim);
}
}
// ---- 2. strokes / dashes / text ----
section("2. strokes / dashes / text x globalAlpha", 190);
{
const float y = 204;
checker(CX[0], y, TW, TH);
Shape2D line; line.mt(CX[0] + 14, y + TH * 0.5f).lt(CX[0] + TW - 14, y + TH * 0.5f)
.set_line_width(18).set_line_cap(Shape2D::CAP_ROUND);
c.save();
c.global_alpha(0.5f).fill_style(tr).stroke_style(rgba(255,120,200,255)).path(line);
c.restore();
label("stroke x 0.5", CX[0], y + TH + 20, 19, dim);
checker(CX[1], y, TW, TH);
Shape2D dl; dl.mt(CX[1] + 14, y + TH * 0.5f).lt(CX[1] + TW - 14, y + TH * 0.5f)
.set_line_width(14).set_line_cap(Shape2D::CAP_ROUND).set_dash_array({22,12});
c.save();
c.global_alpha(0.6f).fill_style(tr).stroke_style(rgba(120,255,170,255)).path(dl);
c.restore();
label("dash x 0.6", CX[1], y + TH + 20, 19, dim);
checker(CX[2], y, TW, TH);
c.save();
c.global_alpha(0.5f);
if (g_font) {
g_font->set_pixel_height(54);
c.font(g_font).fill_style(rgba(255,220,120,255)).stroke_style(tr).fill_text("ALPHA", CX[2] + 16, y + 62);
} else {
Shape2D fb = mask_box(CX[2] + 20, y + 25, TW - 40, TH - 50);
c.fill_style(rgba(255,220,120,255)).stroke_style(tr).path(fb);
}
c.restore();
label(g_font ? "fill_text x 0.5" : "run Font Test first", CX[2], y + TH + 20, 19, dim);
}
// ---- 3. paint servers: gradient / radial / pattern ----
section("3. gradient / radial / pattern paints", 346);
{
const float y = 360;
checker(CX[0], y, TW, TH);
Shape2D r0 = mask_box(CX[0], y, TW, TH);
c.save();
c.global_alpha(0.5f).fill_style(rainbow(CX[0], y, TW)).stroke_style(tr).path(r0);
c.restore();
label("linear gradient x 0.5", CX[0], y + TH + 20, 19, dim);
checker(CX[1], y, TW, TH);
Shape2D r1 = mask_box(CX[1], y, TW, TH);
RadialGradient* rg = mk_rad(CX[1] + TW * 0.5f, y + TH * 0.5f, TH * 0.62f);
rg->add_stop(0.0f, white).add_stop(1.0f, rgba(255,255,255,0));
c.save();
c.global_alpha(0.7f).fill_style(rg).stroke_style(tr).path(r1);
c.restore();
label("radial fade x 0.7", CX[1], y + TH + 20, 19, dim);
checker(CX[2], y, TW, TH);
Shape2D tile_a = mask_box(0, 0, 15, 15), tile_b = mask_box(15, 15, 15, 15);   // named: outlive the pattern
Pattern* pat = new Pattern(30, 30);
pat->add(tile_a, Paint(white), Paint(tr));
pat->add(tile_b, Paint(white), Paint(tr));
Shape2D r2 = mask_box(CX[2], y, TW, TH);
c.save();
c.global_alpha(0.5f).fill_style(pat).stroke_style(tr).path(r2);
c.restore();
delete pat;
label("pattern tile x 0.5", CX[2], y + TH + 20, 19, dim);
}
// ---- 4. globalAlpha x mask / clip / shadow ----
section("4. globalAlpha x mask / clip / shadow", 502);
{
const float y = 516;
checker(CX[0], y, TW, TH);
Shape2D r0 = mask_box(CX[0], y, TW, TH);
Mask* m = mk_mask();
m->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(CX[0], y, TW, TH)
.add_shape(r0, Paint(rgba(255,255,255,128)));
c.save();
c.set_mask(m).global_alpha(0.5f).fill_style(rainbow(CX[0], y, TW)).stroke_style(tr).path(r0);
c.restore();                                   // pops mask AND globalAlpha
label("0.5 x mask 128 = 64", CX[0], y + TH + 20, 19, dim);
checker(CX[1], y, TW, TH);
Shape2D r1 = mask_box(CX[1], y, TW, TH);
Shape2D dc = mask_disc(CX[1] + TW * 0.5f, y + TH * 0.5f, TH * 0.5f);         // named: outlives the draw
ClipPath* cp = mk_clip(); cp->add(dc);
c.save();
c.set_clip(cp).global_alpha(0.5f).fill_style(rainbow(CX[1], y, TW)).stroke_style(tr).path(r1);
c.restore();
label("disc clip x 0.5", CX[1], y + TH + 20, 19, dim);
checker(CX[2], y, TW, TH);
Shape2D shp = mask_box(CX[2] + 30, y + 14, TW - 80, TH - 40);
c.save();
c.global_alpha(0.5f).drop_shadow(6, 6, 3, rgba(0,0,0,230))
.fill_style(rgba(255,230,120,255)).stroke_style(rgba(255,120,60,255)).path(shp);
c.restore();
c.clear_shadow();
label("shadow + shape x 0.5", CX[2], y + TH + 20, 19, dim);
}
// ---- 5. globalAlpha x Porter-Duff ----
section("5. globalAlpha x Porter-Duff", 658);
{
const float y = 672;
auto pd_ga_tile = [&](float x, float ty, CompositeOp op, float ga) {
const int tw = (int)TW, th = (int)TH;
Canvas2D t(tw, th);
Shape2D d = mask_disc(TW * 0.38f, TH * 0.42f, TH * 0.34f);
t.fill_style(rgba(70,130,255,255)).stroke_style(tr).path(d);
Shape2D sr = mask_box(TW * 0.42f, TH * 0.30f, TW * 0.42f, TH * 0.52f);
t.global_alpha(ga).composite_op(op).fill_style(rgba(255,150,50,255)).stroke_style(tr).path(sr);
c.draw_pixels(t.get_buffer(), tw, th, x, ty, TW, TH);
};
checker(CX[0], y, TW, TH); pd_ga_tile(CX[0], y, CompositeOp::Copy, 0.5f);
label("copy x 0.5", CX[0], y + TH + 20, 19, dim);
checker(CX[1], y, TW, TH); pd_ga_tile(CX[1], y, CompositeOp::DestinationOut, 0.5f);
label("destination-out x 0.5", CX[1], y + TH + 20, 19, dim);
checker(CX[2], y, TW, TH); pd_ga_tile(CX[2], y, CompositeOp::DestinationIn, 0.0f);
label("destination-in x 0.0 (clears)", CX[2], y + TH + 20, 19, dim);
}
// ---- 6. save/restore stack / pixels / CTM ----
section("6. save/restore stack / draw_pixels / CTM", 814);
{
const float y = 828;
checker(CX[0], y, TW, TH);
Shape2D b1 = mask_box(CX[0] + 10, y + 10, 120, 70);
Shape2D b2 = mask_box(CX[0] + 50, y + 20, 120, 60);
Shape2D b3 = mask_box(CX[0] + 90, y + 8, 100, 40);
c.save();
c.global_alpha(0.8f).fill_style(rgba(255,140,60,255)).stroke_style(tr).path(b1);
c.save();
c.global_alpha(0.4f).fill_style(rgba(90,220,255,255)).path(b2);
c.restore();                                   // back to 0.8
c.fill_style(rgba(120,255,170,255)).path(b3);
c.restore();                                   // back to 1.0
label("nested save/restore", CX[0], y + TH + 20, 19, dim);
checker(CX[1], y, TW, TH);
uint32_t px[64];
for (int i = 0; i < 64; ++i) px[i] = (((i % 8) + (i / 8)) % 2 == 0) ? rgba(255,150,50,255) : rgba(255,220,120,255);
c.save();
c.global_alpha(0.5f).draw_pixels(px, 8, 8, CX[1] + 20, y + 8, TW - 40, TH - 16);
c.restore();
label("draw_pixels x 0.5", CX[1], y + TH + 20, 19, dim);
checker(CX[2], y, TW, TH);
c.save();
c.translate(CX[2] + TW * 0.5f, y + TH * 0.5f); c.rotate(0.5f);
c.global_alpha(0.5f);
Shape2D rr = mask_box(-60, -30, 120, 60);
c.fill_style(rgba(190,120,255,255)).stroke_style(tr).path(rr);
c.restore();
label("CTM rotate x 0.5", CX[2], y + TH + 20, 19, dim);
}
c.restore();
c.global_alpha(1.0f).fill_style(tr).stroke_style(tr);
mask_pool_reset();
clip_pool_reset();
return 1;
}
// ============================================================================
// TEST 23b - NUMERIC GLOBAL-ALPHA SELF-TEST (returns the failure count, 0 = pass)
// ============================================================================
ag_export(run_globalalpha_selftest)
uint32_t run_globalalpha_selftest() {
mask_pool_reset();
clip_pool_reset();
uint32_t fails = 0, checks = 0;
const uint32_t tr = rgba(0,0,0,0), white = rgba(255,255,255,255);
const uint32_t BLUE = rgba(0,0,255,255), RED = rgba(255,0,0,255);
auto alpha_of = [](uint32_t v) { return (int)(v >> 24); };
auto ga_milli = [](float v) { return (int)(v * 1000.0f + 0.5f); };
auto expect = [&](int got, int want, int tol, const char* name) {
++checks;
if (got < want - tol || got > want + tol) {
++fails;
std::printf("[global-alpha self-test] FAIL %s: got %d, want %d (+/-%d)\n", name, got, want, tol);
}
};
// 1. default value, setter validation (HTML: invalid values are ignored)
{
Canvas2D c(4, 4);
expect(ga_milli(c.global_alpha()), 1000, 0, "default ga is 1.0");
c.global_alpha(0.5f);
expect(ga_milli(c.global_alpha()), 500, 0, "setter 0.5");
c.global_alpha(-0.1f);
expect(ga_milli(c.global_alpha()), 500, 0, "negative ignored");
c.global_alpha(1.1f);
expect(ga_milli(c.global_alpha()), 500, 0, "above 1 ignored");
c.global_alpha(std::numeric_limits<float>::quiet_NaN());
expect(ga_milli(c.global_alpha()), 500, 0, "NaN ignored");
c.global_alpha(std::numeric_limits<float>::infinity());
expect(ga_milli(c.global_alpha()), 500, 0, "infinity ignored");
c.globalAlpha(0.25f);
expect(ga_milli(c.globalAlpha()), 250, 0, "camelCase alias");
c.global_alpha(0.0f);
expect(ga_milli(c.global_alpha()), 0, 0, "zero accepted");
c.global_alpha(1.0f);
expect(ga_milli(c.global_alpha()), 1000, 0, "one accepted");
}
// 2. opaque fill x 0.5 on transparent: alpha 128, straight RGB preserved
{
Canvas2D c(20, 20); c.clear(0);
Shape2D b = mask_box(0, 0, 20, 20);
c.global_alpha(0.5f).fill_style(RED).stroke_style(tr).path(b);
expect(alpha_of(c.get_buffer()[10*20+10]), 128, 1, "fill ga 0.5 alpha");
expect((int)(c.get_buffer()[10*20+10] & 255), 255, 0, "fill ga straight RGB");
}
// 3. opaque fill x 0.5 over opaque destination: 50/50 mix, alpha stays 255
{
Canvas2D c(20, 20); c.clear(0);
Shape2D b = mask_box(0, 0, 20, 20);
c.fill_style(BLUE).stroke_style(tr).path(b);
c.global_alpha(0.5f).fill_style(RED).path(b);
const uint32_t p = c.get_buffer()[10*20+10];
expect(alpha_of(p), 255, 0, "over opaque alpha");
expect((int)(p & 255), 128, 2, "over opaque red mix");
expect((int)((p >> 16) & 255), 128, 2, "over opaque blue mix");
}
// 4. ga = 0 is a no-op for source-over (destination and transparency intact)
{
Canvas2D c(40, 20); c.clear(0);
Shape2D d = mask_box(0, 0, 20, 20), sr = mask_box(10, 0, 20, 20);
c.fill_style(BLUE).stroke_style(tr).path(d);
c.global_alpha(0.0f).fill_style(RED).path(sr);
expect((int)c.get_buffer()[10*40+5], (int)BLUE, 0, "ga 0 dest intact");
expect((int)c.get_buffer()[10*40+15], (int)BLUE, 0, "ga 0 overlap intact");
expect(alpha_of(c.get_buffer()[10*40+25]), 0, 0, "ga 0 source-only empty");
}
// 5. ga = 1 regression: pixel-identical to the legacy (no-ga) path
{
Shape2D hb = mask_box(2.5f, 0, 15, 10);
Canvas2D a(20, 10), b(20, 10); a.clear(0); b.clear(0);
a.fill_style(RED).stroke_style(tr).path(hb);
b.global_alpha(1.0f).fill_style(RED).stroke_style(tr).path(hb);
expect(std::memcmp(a.get_buffer(), b.get_buffer(), 20*10*4) == 0 ? 1 : 0, 1, 0, "ga 1 == legacy");
}
// 6. AA coverage multiplies with ga: half-covered edge x 0.5 -> ~64
{
Canvas2D c(40, 10); c.clear(0);
Shape2D hb = mask_box(10.5f, 0, 29.5f, 10);
c.global_alpha(0.5f).fill_style(white).stroke_style(tr).path(hb);
expect(alpha_of(c.get_buffer()[5*40+9]), 0, 0, "coverage x ga outside");
expect(alpha_of(c.get_buffer()[5*40+10]), 64, 3, "coverage x ga edge");
expect(alpha_of(c.get_buffer()[5*40+11]), 128, 1, "coverage x ga inside");
}
// 7. strokes honour ga
{
Canvas2D c(40, 20); c.clear(0);
Shape2D ln; ln.mt(0, 10).lt(40, 10).set_line_width(8);
c.global_alpha(0.5f).fill_style(tr).stroke_style(white).path(ln);
expect(alpha_of(c.get_buffer()[10*40+20]), 128, 1, "stroke ga centre");
expect(alpha_of(c.get_buffer()[2*40+20]), 0, 0, "stroke ga outside");
}
// 8. gradient paint honours ga
{
Canvas2D c(40, 10); c.clear(0);
LinearGradient* g = mk_lin(0, 0, 40, 0);
g->add_stop(0, white).add_stop(1, white);
Shape2D b = mask_box(0, 0, 40, 10);
c.global_alpha(0.25f).fill_style(g).stroke_style(tr).path(b);
expect(alpha_of(c.get_buffer()[5*40+20]), 64, 1, "gradient ga");
}
// 9. draw_pixels honours ga (nearest + bilinear + partial source alpha)
{
uint32_t px[4] = {white, white, white, white};
Canvas2D a(20, 20); a.clear(0);
a.global_alpha(0.5f).image_smoothing_enabled(false).draw_pixels(px, 2, 2, 0, 0, 20, 20);
expect(alpha_of(a.get_buffer()[10*20+10]), 128, 1, "pixels nearest ga");
expect((int)(a.get_buffer()[10*20+10] & 255), 255, 0, "pixels nearest straight RGB");
uint32_t px2[4] = {rgba(255,255,255,128), rgba(255,255,255,128), rgba(255,255,255,128), rgba(255,255,255,128)};
Canvas2D b(20, 20); b.clear(0);
b.global_alpha(0.5f).image_smoothing_enabled(false).draw_pixels(px2, 2, 2, 0, 0, 20, 20);
expect(alpha_of(b.get_buffer()[10*20+10]), 64, 1, "src alpha x ga");
Canvas2D d(8, 8); d.clear(0);
d.global_alpha(0.25f).draw_pixels(px, 2, 2, 0, 0, 8, 8);
expect(alpha_of(d.get_buffer()[4*8+4]), 64, 1, "bilinear ga");
}
// 10. ga multiplies with masks; mask CONTENT renders at ga = 1
{
Shape2D full = mask_box(0, 0, 20, 20);
Mask* ma = mk_mask();
ma->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(0, 0, 20, 20)
.add_shape(full, Paint(rgba(255,255,255,128)));
Canvas2D a(20, 20); a.clear(0);
a.set_mask(ma).global_alpha(0.5f).fill_style(white).stroke_style(tr).path(full);
expect(alpha_of(a.get_buffer()[10*20+10]), 64, 2, "ga x alpha mask");
a.clear_mask();
Mask* ml = mk_mask();                          // luminance (default), white = 255
ml->set_units(Mask::Units::UserSpaceOnUse).set_region(0, 0, 20, 20).add_shape(full, Paint(white));
Canvas2D b(20, 20); b.clear(0);
b.set_mask(ml).global_alpha(0.5f).fill_style(white).stroke_style(tr).path(full);
expect(alpha_of(b.get_buffer()[10*20+10]), 128, 1, "mask content ignores context ga");
b.clear_mask();
}
// 11. ga multiplies with clip coverage
{
Canvas2D c(20, 20); c.clear(0);
Shape2D full = mask_box(0, 0, 20, 20), right = mask_box(10, 0, 10, 20);   // named: outlive the draw
ClipPath* cp = mk_clip(); cp->add(right);
c.set_clip(cp).global_alpha(0.5f).fill_style(white).stroke_style(tr).path(full);
expect(alpha_of(c.get_buffer()[10*20+15]), 128, 1, "ga x clip inside");
expect(alpha_of(c.get_buffer()[10*20+5]), 0, 0, "ga x clip outside");
c.clear_clip();
}
// 12. shadow alpha scales with ga (shape too)
{
Canvas2D c(60, 20); c.clear(0);
Shape2D b = mask_box(0, 0, 20, 20);
c.global_alpha(0.5f).drop_shadow(30, 0, 0, rgba(0,255,0,255))
.fill_style(RED).stroke_style(tr).path(b);
c.clear_shadow();
const uint32_t sh = c.get_buffer()[10*60+40];
expect(alpha_of(sh), 128, 2, "shadow alpha x ga");
expect((int)((sh >> 8) & 255), 255, 0, "shadow colour kept");
expect(alpha_of(c.get_buffer()[10*60+10]), 128, 1, "shape alpha x ga (shadow path)");
}
// 13. ga feeds the Porter-Duff operators (40x20: dest x[0,20), src x[10,30))
{
auto setup = [&](Canvas2D& c, CompositeOp op, float ga) {
Shape2D d = mask_box(0, 0, 20, 20);
c.fill_style(BLUE).stroke_style(tr).path(d);
Shape2D sr = mask_box(10, 0, 20, 20);
c.global_alpha(ga).composite_op(op).fill_style(RED).stroke_style(tr).path(sr);
c.composite_op(CompositeOp::SourceOver).global_alpha(1.0f);
};
Canvas2D a(40, 20); a.clear(0); setup(a, CompositeOp::Copy, 0.5f);
expect(alpha_of(a.get_buffer()[10*40+15]), 128, 1, "copy x 0.5 overlap");
expect(alpha_of(a.get_buffer()[10*40+25]), 128, 1, "copy x 0.5 source-only");
expect(alpha_of(a.get_buffer()[10*40+5]), 0, 0, "copy x 0.5 dest-only cleared");
Canvas2D b(40, 20); b.clear(0); setup(b, CompositeOp::SourceIn, 0.5f);
expect(alpha_of(b.get_buffer()[10*40+15]), 128, 1, "source-in x 0.5");
expect(alpha_of(b.get_buffer()[10*40+5]), 0, 0, "source-in x 0.5 outside");
Canvas2D d(40, 20); d.clear(0); setup(d, CompositeOp::DestinationOut, 0.5f);
expect((int)d.get_buffer()[10*40+5], (int)BLUE, 0, "destination-out x 0.5 dest-only");
expect(alpha_of(d.get_buffer()[10*40+15]), 127, 1, "destination-out x 0.5 erases half");
Canvas2D e(40, 20); e.clear(0); setup(e, CompositeOp::SourceAtop, 0.5f);
const uint32_t pe = e.get_buffer()[10*40+15];
expect(alpha_of(pe), 255, 0, "source-atop x 0.5 alpha");
expect((int)(pe & 255), 128, 2, "source-atop x 0.5 red mix");
expect((int)((pe >> 16) & 255), 128, 2, "source-atop x 0.5 blue mix");
Canvas2D f(40, 20); f.clear(0); setup(f, CompositeOp::DestinationIn, 0.0f);
expect(alpha_of(f.get_buffer()[10*40+5]), 0, 0, "destination-in x 0 clears A");
expect(alpha_of(f.get_buffer()[10*40+15]), 0, 0, "destination-in x 0 clears B");
Canvas2D g(40, 20); g.clear(0); setup(g, CompositeOp::Copy, 0.0f);
expect(alpha_of(g.get_buffer()[10*40+5]), 0, 0, "copy x 0 clears A");
expect(alpha_of(g.get_buffer()[10*40+15]), 0, 0, "copy x 0 clears B");
Canvas2D h(40, 20); h.clear(0); setup(h, CompositeOp::Clear, 0.0f);
expect(alpha_of(h.get_buffer()[10*40+5]), 0, 0, "clear ignores ga (A)");
expect(alpha_of(h.get_buffer()[10*40+35]), 0, 0, "clear ignores ga (D)");
}
// 14. save/restore pops ga (nested)
{
Canvas2D c(20, 20); c.clear(0);
c.global_alpha(0.5f);
c.save();
c.global_alpha(0.25f);
c.save();
c.global_alpha(0.0f);
c.restore();
expect(ga_milli(c.global_alpha()), 250, 0, "restore pops inner ga");
c.restore();
expect(ga_milli(c.global_alpha()), 500, 0, "restore pops outer ga");
Shape2D b = mask_box(0, 0, 20, 20);
c.fill_style(white).stroke_style(tr).path(b);
expect(alpha_of(c.get_buffer()[10*20+10]), 128, 1, "restored ga applied");
}
// 15. ga under the CTM (translate + scale), restored afterwards
{
Canvas2D c(40, 20); c.clear(0);
c.save();
c.translate(20, 0); c.scale(2, 1);
c.global_alpha(0.5f);
Shape2D r = mask_box(0, 0, 10, 20);
c.fill_style(white).stroke_style(tr).path(r);
c.restore();
expect(alpha_of(c.get_buffer()[10*40+30]), 128, 1, "CTM ga inside");
expect(alpha_of(c.get_buffer()[10*40+10]), 0, 0, "CTM ga outside");
expect(ga_milli(c.global_alpha()), 1000, 0, "CTM save/restore ga");
}
// 16. pattern paint honours ga (tile content renders at ga = 1)
{
Shape2D tile = mask_box(0, 0, 10, 10);         // named: outlives the pattern
Pattern* pat = new Pattern(10, 10);
pat->add(tile, Paint(white), Paint(tr));
Canvas2D c(20, 20); c.clear(0);
Shape2D b = mask_box(0, 0, 20, 20);
c.global_alpha(0.5f).fill_style(pat).stroke_style(tr).path(b);
expect(alpha_of(c.get_buffer()[10*20+10]), 128, 2, "pattern paint x ga");
delete pat;
}
// 17. draw_shape (Font2D-style direct path) honours ga
{
Canvas2D c(20, 20); c.clear(0);
Shape2D b = mask_box(0, 0, 20, 20); b.compile();
c.global_alpha(0.5f).draw_shape(b, Paint(white), Paint(tr));
expect(alpha_of(c.get_buffer()[10*20+10]), 128, 1, "draw_shape ga");
}
// 18. regression: default fill unchanged, exact straight colour
{
Canvas2D c(50, 50); c.clear(0);
Shape2D b = mask_box(10, 10, 30, 30);
c.fill_style(rgba(10,20,30,255)).stroke_style(tr).path(b);
expect((int)c.get_buffer()[25*50+25], (int)rgba(10,20,30,255), 0, "default fill unchanged");
expect(alpha_of(c.get_buffer()[5*50+5]), 0, 0, "default fill outside unchanged");
}
g_globalalpha_selftest_checks = checks;
mask_pool_reset();
clip_pool_reset();
std::printf("[global-alpha self-test] %u/%u checks passed\n", checks - fails, checks);
return fails;
}
ag_export(get_globalalpha_selftest_checks) uint32_t get_globalalpha_selftest_checks() { return g_globalalpha_selftest_checks; }
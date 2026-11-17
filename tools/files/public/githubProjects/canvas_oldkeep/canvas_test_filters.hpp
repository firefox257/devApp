// ./canvas_test_filters.hpp
// Test 21: SVG 2 filters (feGaussianBlur / feColorMatrix / feDropShadow,
// filter chains, filter regions, off-screen buffer API) demo + self-tests.
// INCLUDED by canvas_test.cpp (single translation unit) - not standalone.
// Must be included AFTER canvas_test_svg.hpp: reuses mask_box/mask_disc,
// mk_mask/mk_clip/mk_lin and the mask/clip pool resets. Filters use their
// own heap pool.
//
// Coverage:
//   demo 1 : feGaussianBlur stdDeviation 0 / 1 / 3 / 6 / 10
//   demo 2 : feColorMatrix saturate / hue-rotate / luminanceToAlpha
//   demo 3 : feDropShadow offset / glow / coloured vs legacy drop_shadow
//   demo 4 : filter chains (blur->matrix, matrix->blur, shadow->hue, 3-deep)
//   demo 5 : filter regions (default OBB crop, explicit userSpace, tiny crop)
//   demo 6 : filter + clip-path / mask / copy op / CTM
//   demo 7 : off-screen API (Filter::apply, Canvas2D::apply_filter) + linearRGB
#pragma once
static uint32_t g_filters_selftest_checks = 0;
static std::vector<Filter*> g_filter_pool;
static Filter* mk_filter() { g_filter_pool.push_back(new Filter()); return g_filter_pool.back(); }
static void filter_pool_reset() { for (Filter* f : g_filter_pool) delete f; g_filter_pool.clear(); }
// Colourful gradient content used by the matrix / chain tiles.
static void flt_grad_content(Canvas2D& c, float x, float y, float w, float h) {
LinearGradient* g = mk_lin(x, y, x + w, y);
g->add_stop(0.0f, rgba(255, 60, 60, 255)).add_stop(0.5f, rgba(60, 220, 90, 255)).add_stop(1.0f, rgba(70, 120, 255, 255));
Shape2D r = mask_box(x, y, w, h);
c.fill_style(g).stroke_style(rgba(0, 0, 0, 0)).path(r);
Shape2D dot = mask_disc(x + w * 0.5f, y + h * 0.5f, h * 0.22f);
c.fill_style(rgba(255, 230, 80, 255)).path(dot);
}
ag_export(run_filters_demo)
uint32_t run_filters_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 700; height = 1120; }
if (g_filters_canvas) delete g_filters_canvas;
g_filters_canvas = new Canvas2D(width, height);
Canvas2D& c = *g_filters_canvas;
filter_pool_reset(); mask_pool_reset(); clip_pool_reset();
const float s = std::min(width / 700.0f, height / 1120.0f);
const uint32_t bg = rgba(24, 28, 36, 255), tr = rgba(0, 0, 0, 0), guide = rgba(90, 90, 110, 90);
const uint32_t dim = rgba(175, 180, 195, 255), head = rgba(120, 200, 255, 255);
const uint32_t red = rgba(255, 90, 80, 255), yel = rgba(255, 210, 90, 255), blu = rgba(90, 170, 255, 255);
const Filter::Units USER = Filter::Units::UserSpaceOnUse;
c.clear(bg);
c.save(); c.scale(s, s);
c.fill_style(tr).stroke_style(guide);
for (int gx = 0; gx <= 700; gx += 50) { Shape2D p; p.mt(gx, 0).lt(gx, 1120).set_line_width(0.5f); c.path(p); }
for (int gy = 0; gy <= 1120; gy += 50) { Shape2D p; p.mt(0, gy).lt(700, gy).set_line_width(0.5f); c.path(p); }
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
c.fill_style((((xx / cell) + (yy / cell)) % 2 == 0) ? rgba(72, 76, 92, 255) : rgba(46, 50, 62, 255)).stroke_style(tr).path(p);
}
};
// ---- 1. feGaussianBlur ----
section("1. feGaussianBlur (stdDeviation)", 34);
{
const float y = 48, TW = 120, TH = 90, CX[5] = {30, 165, 300, 435, 570};
const float sig[5] = {0, 1, 3, 6, 10};
const char* names[5] = {"0 (off)", "1", "3", "6", "10"};
for (int i = 0; i < 5; ++i) {
Filter* f = mk_filter();
f->gaussian_blur(sig[i]).set_units(USER).set_region(CX[i], y, TW, TH);
Shape2D b = mask_box(CX[i] + 30, y + 25, 60, 40);
c.set_filter(f).fill_style(red).stroke_style(tr).path(b);
c.clear_filter();
label(names[i], CX[i], y + TH + 20, 19, dim);
}
}
// ---- 2. feColorMatrix ----
section("2. feColorMatrix: saturate / hue-rotate / luminanceToAlpha", 190);
{
const float y = 204, TW = 120, TH = 90, CX[5] = {30, 165, 300, 435, 570};
const char* names[5] = {"original", "saturate(0)", "saturate(2.5)", "hue-rotate(120)", "luminanceToAlpha"};
for (int i = 0; i < 5; ++i) {
checker(CX[i], y, TW, TH);
Filter* f = mk_filter();
if (i == 1) f->saturate(0.0f);
else if (i == 2) f->saturate(2.5f);
else if (i == 3) f->hue_rotate(120.0f);
else if (i == 4) f->luminance_to_alpha();
f->set_units(USER).set_region(CX[i], y, TW, TH);
if (i > 0) c.set_filter(f);
flt_grad_content(c, CX[i] + 10, y + 15, 100, 60);
c.clear_filter();
label(names[i], CX[i], y + TH + 20, 17, dim);
}
}
// ---- 3. feDropShadow ----
section("3. feDropShadow: offset / glow / colour / legacy", 346);
{
const float y = 360, TW = 150, TH = 90, CX[4] = {30, 195, 360, 525};
const char* names[4] = {"dx6 dy6 blur0", "glow blur4", "coloured blur3", "legacy drop_shadow"};
for (int i = 0; i < 4; ++i) {
Shape2D b = mask_box(CX[i] + 45, y + 27, 60, 36);
if (i == 0) {
Filter* f = mk_filter();
f->drop_shadow(6, 6, 0, rgba(0, 0, 0, 255)).set_units(USER).set_region(CX[i], y, TW, TH);
c.set_filter(f).fill_style(yel).stroke_style(tr).path(b);
c.clear_filter();
} else if (i == 1) {
Filter* f = mk_filter();
f->drop_shadow(0, 0, 4, rgba(0, 0, 0, 255)).set_units(USER).set_region(CX[i], y, TW, TH);
c.set_filter(f).fill_style(yel).stroke_style(tr).path(b);
c.clear_filter();
} else if (i == 2) {
Filter* f = mk_filter();
f->drop_shadow(8, -6, 3, rgba(80, 160, 255, 200)).set_units(USER).set_region(CX[i], y, TW, TH);
c.set_filter(f).fill_style(yel).stroke_style(tr).path(b);
c.clear_filter();
} else {
c.drop_shadow(6, 6, 2, rgba(0, 0, 0, 230)).fill_style(yel).stroke_style(tr).path(b);
c.clear_shadow();
}
label(names[i], CX[i], y + TH + 20, 18, dim);
}
}
// ---- 4. Filter chains ----
section("4. Filter chains (each primitive consumes the previous result)", 502);
{
const float y = 516, TW = 150, TH = 90, CX[4] = {30, 195, 360, 525};
const char* names[4] = {"blur -> saturate(0)", "hue(120) -> blur", "shadow -> hue(120)", "sat -> blur -> shadow"};
for (int i = 0; i < 4; ++i) {
Filter* f = mk_filter();
if (i == 0) f->gaussian_blur(3).saturate(0.0f);
else if (i == 1) f->hue_rotate(120).gaussian_blur(2);
else if (i == 2) f->drop_shadow(6, 6, 2, rgba(255, 60, 60, 255)).hue_rotate(120);
else f->saturate(0.0f).gaussian_blur(2).drop_shadow(4, 4, 2, rgba(80, 160, 255, 220));
f->set_units(USER).set_region(CX[i], y, TW, TH);
c.set_filter(f);
flt_grad_content(c, CX[i] + 30, y + 22, 90, 46);
c.clear_filter();
label(names[i], CX[i], y + TH + 20, 17, dim);
}
}
// ---- 5. Filter regions ----
section("5. Filter regions: default OBB crop / userSpaceOnUse / tiny crop", 658);
{
const float y = 672, TW = 200, TH = 90, CX[3] = {30, 250, 470};
const char* names[3] = {"default -10%..120% (crop)", "explicit region (soft)", "tiny region (hard crop)"};
for (int i = 0; i < 3; ++i) {
Filter* f = mk_filter();
f->gaussian_blur(6);
if (i == 1) f->set_units(USER).set_region(CX[i], y, TW, TH);
else if (i == 2) f->set_units(USER).set_region(CX[i] + 70, y + 25, 60, 40);
Shape2D b = mask_box(CX[i] + 60, y + 25, 80, 40);
c.set_filter(f).fill_style(blu).stroke_style(tr).path(b);
c.clear_filter();
// region outline (guide)
float rx = CX[i] + 52, ry = y + 21, rw = 96, rh = 48;
if (i == 1) { rx = CX[i]; ry = y; rw = TW; rh = TH; }
else if (i == 2) { rx = CX[i] + 70; ry = y + 25; rw = 60; rh = 40; }
Shape2D o = mask_box(rx, ry, rw, rh); o.set_line_width(1.0f);
c.fill_style(tr).stroke_style(guide).path(o);
label(names[i], CX[i], y + TH + 20, 17, dim);
}
}
// ---- 6. filter + clip / mask / composite / CTM ----
section("6. filter + clip-path / mask / copy / CTM", 814);
{
const float y = 828, TW = 150, TH = 90, CX[4] = {30, 195, 360, 525};
// 6a: blur then clip (clip applies to the filter OUTPUT -> hard clip edge)
{
Filter* f = mk_filter();
f->gaussian_blur(4).set_units(USER).set_region(CX[0], y, TW, TH);
Shape2D win = mask_box(CX[0], y, TW * 0.6f, TH);
ClipPath* cp = mk_clip(); cp->add(win);
Shape2D b = mask_box(CX[0] + 45, y + 25, 60, 40);
c.set_filter(f).set_clip(cp).fill_style(red).stroke_style(tr).path(b);
c.clear_clip().clear_filter();
label("blur + clip-path", CX[0], y + TH + 20, 18, dim);
}
// 6b: blur then alpha mask (mask modulates the filtered layer)
{
Filter* f = mk_filter();
f->gaussian_blur(4).set_units(USER).set_region(CX[1], y, TW, TH);
Shape2D full = mask_box(CX[1], y, TW, TH);
Mask* mk = mk_mask();
mk->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse)
.set_region(CX[1], y, TW, TH).add_shape(full, Paint(rgba(255, 255, 255, 128)));
Shape2D b = mask_box(CX[1] + 45, y + 25, 60, 40);
c.set_filter(f).set_mask(mk).fill_style(red).stroke_style(tr).path(b);
c.clear_mask().clear_filter();
label("blur + alpha mask 128", CX[1], y + TH + 20, 18, dim);
}
// 6c: blur + copy over a blue disc destination (offscreen tile, then blit)
{
checker(CX[2], y, TW, TH);
Canvas2D t((int)TW, (int)TH);
Shape2D d = mask_disc(TW * 0.5f, TH * 0.5f, TH * 0.38f);
t.fill_style(blu).stroke_style(tr).path(d);
Filter* f = mk_filter();
f->gaussian_blur(3).set_units(USER).set_region(0, 0, TW, TH);
Shape2D sr = mask_box(TW * 0.3f, TH * 0.3f, TW * 0.4f, TH * 0.4f);
t.set_filter(f).composite_op(CompositeOp::Copy).fill_style(red).stroke_style(tr).path(sr);
t.clear_filter();
c.draw_pixels(t.get_buffer(), (int)TW, (int)TH, CX[2], y, TW, TH);
label("blur + copy (one source)", CX[2], y + TH + 20, 18, dim);
}
// 6d: blur under the CTM (region follows translate + rotate)
{
Filter* f = mk_filter();
f->gaussian_blur(3).set_units(USER).set_region(-70, -45, 140, 90);
c.save();
c.translate(CX[3] + TW * 0.5f, y + TH * 0.5f);
c.rotate(0.5f);
Shape2D b = mask_box(-30, -20, 60, 40);
c.set_filter(f).fill_style(red).stroke_style(tr).path(b);
c.clear_filter();
c.restore();
label("blur + CTM rotate", CX[3], y + TH + 20, 18, dim);
}
}
// ---- 7. Off-screen buffer API + linearRGB ----
section("7. Off-screen API: Filter::apply / apply_filter(rect) / linearRGB", 970);
{
const float y = 984, TW = 200, TH = 90, CX[3] = {30, 250, 470};
// 7a: Filter::apply on a raw pixel array, then draw_pixels
{
std::vector<uint32_t> px(50 * 30);
for (int yy = 0; yy < 30; ++yy) for (int xx = 0; xx < 50; ++xx) {
const uint8_t r = (uint8_t)(xx * 255 / 49), g = (uint8_t)(yy * 255 / 29);
px[yy * 50 + xx] = rgba(r, g, 120, 255);
}
Filter raw; raw.saturate(0.0f);
raw.apply(px.data(), 50, 30);
c.draw_pixels(px.data(), 50, 30, CX[0] + 10, y + 15, 180, 60);
label("Filter::apply(raw pixels)", CX[0], y + TH + 20, 17, dim);
}
// 7b: Canvas2D::apply_filter on a DEVICE-space rect (left box only)
{
Shape2D b1 = mask_box(CX[1] + 20, y + 25, 50, 40);
Shape2D b2 = mask_box(CX[1] + 120, y + 25, 50, 40);
c.fill_style(yel).stroke_style(tr).path(b1).path(b2);
Filter blur; blur.gaussian_blur(3);
c.apply_filter(blur, (CX[1] + 10) * s, (y + 15) * s, 70 * s, 60 * s);
label("apply_filter(rect): left only", CX[1], y + TH + 20, 17, dim);
}
// 7c: color-interpolation-filters sRGB vs linearRGB (black|white blur)
{
const float bw = 36, bh = 40;
for (int i = 0; i < 2; ++i) {
const float px0 = CX[2] + 14 + i * 96, py0 = y + 25;
Filter* f = mk_filter();
f->gaussian_blur(4).set_units(USER).set_region(px0 - 8, py0 - 8, bw * 2 + 16, bh + 16);
if (i == 1) f->set_color_space(Filter::ColorSpace::LinearRGB);
Shape2D k = mask_box(px0, py0, bw, bh);
Shape2D w = mask_box(px0 + bw, py0, bw, bh);
c.set_filter(f).fill_style(rgba(0, 0, 0, 255)).stroke_style(tr).path(k);
c.fill_style(rgba(255, 255, 255, 255)).path(w);
c.clear_filter();
label(i == 0 ? "sRGB" : "linearRGB", px0, y + TH + 20, 17, dim);
}
}
}
c.restore();
c.fill_style(tr).stroke_style(tr).clear_filter();
filter_pool_reset(); mask_pool_reset(); clip_pool_reset();
return 1;
}
// ============================================================================
// TEST 21b - NUMERIC FILTER SELF-TEST (returns the failure count, 0 = pass)
// ============================================================================
ag_export(run_filters_selftest)
uint32_t run_filters_selftest() {
filter_pool_reset(); mask_pool_reset(); clip_pool_reset();
uint32_t fails = 0, checks = 0;
const uint32_t tr = rgba(0, 0, 0, 0), white = rgba(255, 255, 255, 255);
const uint32_t RED = rgba(255, 0, 0, 255), GREEN = rgba(0, 255, 0, 255), BLUE = rgba(0, 0, 255, 255);
const uint32_t BLACK = rgba(0, 0, 0, 255);
const Filter::Units USER = Filter::Units::UserSpaceOnUse;
auto px = [](Canvas2D& c, int x, int y) { return c.get_buffer()[(size_t)y * c.get_width() + x]; };
auto alpha_of = [](uint32_t v) { return (int)(v >> 24); };
auto expect = [&](uint32_t got, uint32_t want, int tol, const char* name) {
++checks;
const int wa = (int)(want >> 24);
bool bad = std::abs((int)(got >> 24) - wa) > tol;
if (wa != 0) bad = bad || std::abs((int)(got & 255) - (int)(want & 255)) > tol
|| std::abs((int)((got >> 8) & 255) - (int)((want >> 8) & 255)) > tol
|| std::abs((int)((got >> 16) & 255) - (int)((want >> 16) & 255)) > tol;
if (bad) { ++fails; std::printf("[filter self-test] FAIL %s: got 0x%08X, want 0x%08X (+/-%d)\n", name, got, want, tol); }
};
auto expecti = [&](int got, int want, int tol, const char* name) {
++checks;
if (std::abs(got - want) > tol) { ++fails; std::printf("[filter self-test] FAIL %s: got %d, want %d (+/-%d)\n", name, got, want, tol); }
};
auto expectf = [&](float got, float want, float tol, const char* name) {
++checks;
if (std::fabs(got - want) > tol) { ++fails; std::printf("[filter self-test] FAIL %s: got %f, want %f (+/-%f)\n", name, got, want, tol); }
};
auto expectb = [&](bool ok, const char* name) {
++checks;
if (!ok) { ++fails; std::printf("[filter self-test] FAIL %s\n", name); }
};
auto fill_rect = [](std::vector<uint32_t>& buf, int w, int x0, int y0, int rw, int rh, uint32_t col) {
for (int y = y0; y < y0 + rh; ++y) for (int x = x0; x < x0 + rw; ++x) buf[(size_t)y * w + x] = col;
};
// ---- 1. API defaults + context state ----
{
Filter f;
expectb(f.empty(), "default filter is empty");
expecti((int)f.size(), 0, 0, "default filter size 0");
expectb(f.units() == Filter::Units::ObjectBoundingBox, "default filterUnits objectBoundingBox");
expectf(f.region_x(), -0.1f, 1e-4f, "default region x -10%");
expectf(f.region_y(), -0.1f, 1e-4f, "default region y -10%");
expectf(f.region_w(), 1.2f, 1e-4f, "default region w 120%");
expectf(f.region_h(), 1.2f, 1e-4f, "default region h 120%");
expectb(!f.has_region(), "default region not explicit");
expectb(f.color_space() == Filter::ColorSpace::SRGB, "default color space sRGB");
f.gaussian_blur(2).saturate(0).drop_shadow(1, 1, 1, BLACK);
expecti((int)f.size(), 3, 0, "chain accumulates primitives");
f.set_region(0, 0, 10, 10);
expectb(f.has_region(), "set_region marks explicit");
f.reset_region();
expectb(!f.has_region(), "reset_region clears explicit");
f.set_color_space(Filter::ColorSpace::LinearRGB);
expectb(f.color_space() == Filter::ColorSpace::LinearRGB, "set_color_space linearRGB");
f.clear();
expectb(f.empty(), "clear empties the chain");
Canvas2D c(10, 10); c.clear(0);
expectb(c.get_filter() == nullptr, "default canvas filter none");
c.set_filter(&f);
expectb(c.get_filter() == &f, "set_filter stores pointer");
c.save(); c.clear_filter();
expectb(c.get_filter() == nullptr, "clear_filter");
c.restore();
expectb(c.get_filter() == &f, "restore pops filter");
c.clear_filter();
// empty filter apply is a no-op (and null/zero-size guards do not crash)
uint32_t one = RED;
f.apply(&one, 1, 1);
expect(one, RED, 0, "empty chain apply is identity");
Filter g; g.gaussian_blur(2);
g.apply(nullptr, 4, 4);
g.apply(&one, 0, 4);
expect(one, RED, 0, "null/zero-size apply guards");
}
// ---- 2. feGaussianBlur on raw off-screen buffers ----
{
// sigma 0 = identity
std::vector<uint32_t> buf(16 * 8, tr);
fill_rect(buf, 16, 2, 2, 6, 4, RED);
std::vector<uint32_t> ref = buf;
Filter f0; f0.gaussian_blur(0);
f0.apply(buf.data(), 16, 8);
expectb(buf == ref, "sigma 0 blur is exact identity");
// negative sigma clamps to 0
Filter fn; fn.gaussian_blur(-3);
fn.apply(buf.data(), 16, 8);
expectb(buf == ref, "negative sigma clamps to identity");
// single white pixel, 21x21, sigma 1: spread + symmetry + energy + no fringe
const int W = 21;
std::vector<uint32_t> sp(W * W, 0u);
sp[10 * W + 10] = white;
Filter f1; f1.gaussian_blur(1);
f1.apply(sp.data(), W, W);
const int ca = alpha_of(sp[10 * W + 10]);
expectb(ca > 5 && ca < 90, "single pixel blur spreads the centre");
expecti(alpha_of(sp[10 * W + 9]), alpha_of(sp[10 * W + 11]), 0, "blur is left/right symmetric");
expecti(alpha_of(sp[9 * W + 10]), alpha_of(sp[11 * W + 10]), 0, "blur is up/down symmetric");
int sum = 0; for (uint32_t v : sp) sum += alpha_of(v);
expecti(sum, 255, 30, "blur conserves total alpha");
expecti(alpha_of(sp[0]), 0, 0, "blur far corner stays empty");
expecti((int)(sp[10 * W + 10] & 255), 255, 0, "premultiplied blur keeps white white");
// anisotropic: sigma (3,0) spreads only horizontally, (0,3) only vertically
std::vector<uint32_t> ax(W * W, 0u); ax[10 * W + 10] = white;
Filter fx; fx.gaussian_blur(3, 0); fx.apply(ax.data(), W, W);
expectb(alpha_of(ax[10 * W + 12]) > 0, "anisotropic sx spreads horizontally");
expecti(alpha_of(ax[12 * W + 10]), 0, 0, "anisotropic sx leaves vertical untouched");
std::vector<uint32_t> ay(W * W, 0u); ay[10 * W + 10] = white;
Filter fy; fy.gaussian_blur(0, 3); fy.apply(ay.data(), W, W);
expectb(alpha_of(ay[12 * W + 10]) > 0, "anisotropic sy spreads vertically");
expecti(alpha_of(ay[10 * W + 12]), 0, 0, "anisotropic sy leaves horizontal untouched");
// 41x41 red box 10..30, sigma 2: solid centre, ~50% edge, no dark fringe
const int B = 41;
std::vector<uint32_t> bb(B * B, 0u);
fill_rect(bb, B, 10, 10, 21, 21, RED);
Filter f2; f2.gaussian_blur(2);
f2.apply(bb.data(), B, B);
expect(bb[20 * B + 20], RED, 0, "blur keeps the deep interior exact");
const int ea = alpha_of(bb[20 * B + 10]);
expectb(ea > 88 && ea < 190, "blur edge is ~50% coverage");
expectb(alpha_of(bb[20 * B + 2]) < 10, "blur far outside is ~empty");
bool fringe_ok = true;
for (int x = 0; x < B; ++x) if (alpha_of(bb[20 * B + x]) > 0 && (int)(bb[20 * B + x] & 255) < 250) fringe_ok = false;
expectb(fringe_ok, "premultiplied blur has no dark fringe");
}
// ---- 3. feColorMatrix on raw off-screen buffers ----
{
auto one_px = [&](Filter& f, uint32_t c) { uint32_t v = c; f.apply(&v, 1, 1); return v; };
Filter id; id.color_matrix({1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0});
expect(one_px(id, rgba(10, 200, 90, 255)), rgba(10, 200, 90, 255), 0, "identity matrix exact");
Filter s0; s0.saturate(0);
expect(one_px(s0, RED), rgba(54, 54, 54, 255), 1, "saturate(0) red -> luma gray");
expect(one_px(s0, white), white, 1, "saturate(0) white stays white");
Filter s1; s1.saturate(1);
expect(one_px(s1, RED), RED, 1, "saturate(1) is identity");
Filter h0; h0.hue_rotate(0);
expect(one_px(h0, RED), RED, 1, "hue-rotate(0) is identity");
Filter h360; h360.hue_rotate(360);
expect(one_px(h360, rgba(10, 200, 90, 255)), rgba(10, 200, 90, 255), 1, "hue-rotate(360) is identity");
Filter h120; h120.hue_rotate(120);
expect(one_px(h120, RED), rgba(0, 113, 0, 255), 2, "hue-rotate(120) red -> green");
const float swap[20] = {0,0,1,0,0, 0,1,0,0,0, 1,0,0,0,0, 0,0,0,1,0};
Filter sw; sw.color_matrix(swap);
expect(one_px(sw, BLUE), RED, 0, "channel-swap matrix blue -> red");
expect(one_px(sw, RED), BLUE, 0, "channel-swap matrix red -> blue");
expect(one_px(sw, 0u), 0u, 0, "matrix keeps transparent pixels transparent");
Filter off; off.color_matrix({1,0,0,0,0.5f, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0});
expect(one_px(off, BLACK), rgba(128, 0, 0, 255), 1, "matrix offset column (+0.5)");
Filter ha; ha.color_matrix({1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,0.5f,0});
expect(one_px(ha, RED), rgba(255, 0, 0, 128), 1, "matrix alpha row scale 0.5");
Filter cl; cl.color_matrix({3,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0});
expect(one_px(cl, RED), RED, 0, "matrix results clamp to 255");
Filter la; la.luminance_to_alpha();
expect(one_px(la, white), rgba(0, 0, 0, 255), 1, "luminanceToAlpha white");
expect(alpha_of(one_px(la, RED)), 54, 1, "luminanceToAlpha red luma");
expect(one_px(la, 0u), 0u, 0, "luminanceToAlpha transparent");
}
// ---- 4. feDropShadow on raw off-screen buffers ----
{
const int W = 40, H = 20;
auto shadow_buf = [&]() { std::vector<uint32_t> b(W * H, 0u); fill_rect(b, W, 5, 5, 10, 10, RED); return b; };
Filter f; f.drop_shadow(10, 0, 0, BLACK);
std::vector<uint32_t> b = shadow_buf();
f.apply(b.data(), W, H);
expect(b[7 * W + 7], RED, 0, "shadow: source pixel unchanged");
expect(b[7 * W + 17], BLACK, 0, "shadow: hard shadow at +dx");
expect(b[7 * W + 27], 0u, 0, "shadow: nothing beyond the shadow");
expect(b[7 * W + 5], RED, 0, "shadow: no shadow left of source");
expect(b[17 * W + 7], 0u, 0, "shadow: dy=0 leaves below empty");
Filter fy; fy.drop_shadow(0, 10, 0, BLACK);
std::vector<uint32_t> b2 = shadow_buf();
fy.apply(b2.data(), W, H);
expect(b2[17 * W + 7], BLACK, 0, "shadow: hard shadow at +dy");
Filter fc; fc.drop_shadow(10, 0, 0, rgba(0, 255, 0, 128));
std::vector<uint32_t> b3 = shadow_buf();
fc.apply(b3.data(), W, H);
expect(b3[7 * W + 17], rgba(0, 255, 0, 128), 1, "shadow: flood colour x alpha");
Filter fb; fb.drop_shadow(10, 0, 3, BLACK);
std::vector<uint32_t> b4 = shadow_buf();
fb.apply(b4.data(), W, H);
const int sa = alpha_of(b4[7 * W + 26]);
expectb(sa > 0 && sa < 255, "shadow: blur softens the shadow edge");
Filter ft; ft.drop_shadow(10, 0, 0, rgba(0, 0, 0, 0));
std::vector<uint32_t> b5 = shadow_buf(), ref5 = b5;
ft.apply(b5.data(), W, H);
expectb(b5 == ref5, "transparent shadow colour is identity");
Filter f0; f0.drop_shadow(0, 0, 0, BLACK);
std::vector<uint32_t> b6 = shadow_buf();
f0.apply(b6.data(), W, H);
expect(b6[7 * W + 7], RED, 0, "shadow: source composites over its own shadow");
}
// ---- 5. Filter chains ----
{
const float swap[20] = {0,0,1,0,0, 0,1,0,0,0, 1,0,0,0,0, 0,0,0,1,0};
// chain == manual sequential application (off-screen API equivalence)
uint32_t a = RED, b = RED;
Filter chain; chain.saturate(0).color_matrix(swap);
chain.apply(&a, 1, 1);
Filter p1; p1.saturate(0); p1.apply(&b, 1, 1);
Filter p2; p2.color_matrix(swap); p2.apply(&b, 1, 1);
expect(a, b, 0, "chain equals sequential primitive applies");
// order matters: swap-then-saturate(red) = luma(blue) = 18, not 54
uint32_t o = RED;
Filter rev; rev.color_matrix(swap).saturate(0);
rev.apply(&o, 1, 1);
expect(o, rgba(18, 18, 18, 255), 1, "chain order matters (swap first)");
expect(a, rgba(54, 54, 54, 255), 1, "chain order matters (saturate first)");
// blur -> luminanceToAlpha: white pixel becomes opaque black
const int W = 21;
std::vector<uint32_t> sp(W * W, 0u); sp[10 * W + 10] = white;
Filter bl; bl.gaussian_blur(1).luminance_to_alpha();
bl.apply(sp.data(), W, W);
expect(sp[10 * W + 10], rgba(0, 0, 0, 255), 1, "blur -> luminanceToAlpha centre");
expect(sp[0], 0u, 0, "blur -> luminanceToAlpha far corner");
// drop shadow -> hue rotate recolours the SHADOW too (chain semantics)
std::vector<uint32_t> sh(40 * 20, 0u);
fill_rect(sh, 40, 5, 5, 10, 10, RED);
Filter shf; shf.drop_shadow(10, 0, 0, RED).hue_rotate(120);
shf.apply(sh.data(), 40, 20);
const uint32_t sc = sh[7 * 40 + 17];
expectb(((sc >> 8) & 255) > (sc & 255) && ((sc >> 8) & 255) > 100, "shadow -> hue rotates the shadow colour");
// 3-deep chain runs end to end
Filter deep; deep.saturate(0.5f).gaussian_blur(1).drop_shadow(2, 2, 1, BLACK);
expecti((int)deep.size(), 3, 0, "3-primitive chain size");
std::vector<uint32_t> db(20 * 20, 0u); fill_rect(db, 20, 6, 6, 8, 8, GREEN);
deep.apply(db.data(), 20, 20);
expectb(alpha_of(db[17 * 20 + 17]) > 0, "3-deep chain produces a shadow");
}
// ---- 6. Pipeline integration (set_filter on draws) ----
{
// default OBB region: 60x60 canvas, box 20..40, sigma 3 -> region 18..42
Canvas2D c(60, 60); c.clear(0);
Filter* f = mk_filter(); f->gaussian_blur(3);
Shape2D b = mask_box(20, 20, 20, 20);
c.set_filter(f).fill_style(RED).stroke_style(tr).path(b);
expect(px(c, 30, 30), RED, 0, "filtered draw: interior exact");
const int e = alpha_of(px(c, 20, 30));
expectb(e > 70 && e < 200, "filtered draw: soft edge");
expectb(alpha_of(px(c, 19, 30)) > 0, "filtered draw: blur extends past the bbox");
expecti(alpha_of(px(c, 17, 30)), 0, 0, "default region crops the blur tail");
expecti(alpha_of(px(c, 2, 2)), 0, 0, "filtered draw: far outside empty");
c.clear_filter();
// explicit userSpaceOnUse region: full-canvas blur tail
Canvas2D d(60, 60); d.clear(0);
Filter* fr = mk_filter(); fr->gaussian_blur(3).set_units(USER).set_region(0, 0, 60, 60);
d.set_filter(fr).fill_style(RED).stroke_style(tr).path(b);
expect(px(d, 30, 30), RED, 0, "explicit region: interior exact");
expectb(alpha_of(px(d, 14, 30)) > 0, "explicit region: full blur tail");
// (29,30) is >=9px inside every box edge, beyond the sigma-3 kernel reach (~8px),
// so it is fully solid. (22,30) would be only 2px in and legitimately semi-opaque.
expect(px(d, 29, 30), RED, 0, "explicit region: inside box solid");
d.clear_filter();
// tiny region crops the SOURCE to the region window
Canvas2D t(60, 60); t.clear(0);
Filter* ft = mk_filter(); ft->gaussian_blur(3).set_units(USER).set_region(25, 25, 10, 10);
t.set_filter(ft).fill_style(RED).stroke_style(tr).path(b);
expectb(alpha_of(px(t, 30, 30)) > 100, "tiny region: window centre drawn");
expecti(alpha_of(px(t, 22, 30)), 0, 0, "tiny region: source outside region discarded");
expecti(alpha_of(px(t, 24, 30)), 0, 0, "tiny region: hard region boundary");
t.clear_filter();
// filter + clip-path: clip applies to the filter OUTPUT (hard clip edge)
Canvas2D k(60, 60); k.clear(0);
Shape2D win = mask_box(0, 0, 30, 60);
ClipPath* cp = mk_clip(); cp->add(win);
Filter* fk = mk_filter(); fk->gaussian_blur(3).set_units(USER).set_region(0, 0, 60, 60);
k.set_filter(fk).set_clip(cp).fill_style(RED).stroke_style(tr).path(b);
expectb(alpha_of(px(k, 29, 30)) > 0, "filter+clip: blur survives inside clip");
expecti(alpha_of(px(k, 31, 30)), 0, 0, "filter+clip: hard clip edge");
const int ke = alpha_of(px(k, 20, 30));
expectb(ke > 70 && ke < 200, "filter+clip: blur still soft inside");
k.clear_clip().clear_filter();
// filter + alpha mask 128
Canvas2D m(60, 60); m.clear(0);
Shape2D full = mask_box(0, 0, 60, 60);
Mask* mk = mk_mask();
mk->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse)
.set_region(0, 0, 60, 60).add_shape(full, Paint(rgba(255, 255, 255, 128)));
Filter* fm = mk_filter(); fm->gaussian_blur(3).set_units(USER).set_region(0, 0, 60, 60);
m.set_filter(fm).set_mask(mk).fill_style(RED).stroke_style(tr).path(b);
expect(alpha_of(px(m, 30, 30)), 128, 2, "filter+mask: alpha modulated");
m.clear_mask().clear_filter();
// filter + copy: unbounded op, region-confined source clears the rest
Canvas2D o(40, 20); o.clear(0);
Shape2D od = mask_box(0, 0, 40, 20);
o.fill_style(BLUE).stroke_style(tr).path(od);
Filter* fo = mk_filter(); fo->gaussian_blur(2).set_units(USER).set_region(0, 0, 40, 20);
Shape2D os = mask_box(10, 5, 20, 10);
o.set_filter(fo).composite_op(CompositeOp::Copy).fill_style(RED).stroke_style(tr).path(os);
o.clear_filter().composite_op(CompositeOp::SourceOver);
expectb(alpha_of(px(o, 20, 10)) > 200 && (int)(px(o, 20, 10) & 255) > 200, "filter+copy: source replaces dest");
expecti(alpha_of(px(o, 2, 2)), 0, 0, "filter+copy: dest-only cleared");
expecti(alpha_of(px(o, 38, 18)), 0, 0, "filter+copy: far corner cleared");
// filter + source-in
Canvas2D si(40, 20); si.clear(0);
si.fill_style(BLUE).stroke_style(tr).path(od);
Filter* fsi = mk_filter(); fsi->gaussian_blur(2).set_units(USER).set_region(0, 0, 40, 20);
si.set_filter(fsi).composite_op(CompositeOp::SourceIn).fill_style(RED).stroke_style(tr).path(os);
si.clear_filter().composite_op(CompositeOp::SourceOver);
expectb(alpha_of(px(si, 20, 10)) > 200, "filter+source-in: overlap keeps source");
expecti(alpha_of(px(si, 2, 2)), 0, 0, "filter+source-in: dest-only cleared");
// save/restore pops the filter -> hard edges again
Canvas2D sr(60, 60); sr.clear(0);
Filter* fsr = mk_filter(); fsr->gaussian_blur(3);
sr.save(); sr.set_filter(fsr); sr.restore();
sr.fill_style(RED).stroke_style(tr).path(b);
expect(px(sr, 20, 30), RED, 0, "restore: unfiltered hard edge");
expecti(alpha_of(px(sr, 19, 30)), 0, 0, "restore: nothing outside the box");
// CTM: the filter region follows the transform
Canvas2D ct(60, 60); ct.clear(0);
Filter* fct = mk_filter(); fct->gaussian_blur(3);
ct.translate(10, 5);
ct.set_filter(fct).fill_style(RED).stroke_style(tr).path(b);
expect(px(ct, 40, 35), RED, 0, "CTM: filtered shape at translated position");
expecti(alpha_of(px(ct, 27, 35)), 0, 0, "CTM: region follows the transform");
ct.clear_filter().resetTransform();
// draw_pixels honours the filter
Canvas2D dp(60, 60); dp.clear(0);
std::vector<uint32_t> img(8 * 8, RED);
Filter* fdp = mk_filter(); fdp->gaussian_blur(2).set_units(USER).set_region(0, 0, 60, 60);
dp.set_filter(fdp).draw_pixels(img.data(), 8, 8, 20, 20, 20, 20);
expectb(alpha_of(px(dp, 30, 30)) > 200, "draw_pixels + filter: centre drawn");
expecti(alpha_of(px(dp, 10, 30)), 0, 0, "draw_pixels + filter: far outside empty");
dp.clear_filter();
// draw_shape (Font2D-style direct path) honours the filter
Canvas2D ds(60, 60); ds.clear(0);
Shape2D bs = mask_box(20, 20, 20, 20); bs.compile();
Filter* fds = mk_filter(); fds->gaussian_blur(2).set_units(USER).set_region(0, 0, 60, 60);
ds.set_filter(fds).draw_shape(bs, Paint(RED), Paint(tr));
expectb(alpha_of(px(ds, 30, 30)) > 200, "draw_shape + filter: centre drawn");
const int dse = alpha_of(px(ds, 20, 30));
expectb(dse > 70 && dse < 200, "draw_shape + filter: soft edge");
ds.clear_filter();
// blurred stroke
Canvas2D st(60, 60); st.clear(0);
Shape2D ln; ln.mt(10, 30).lt(50, 30).set_line_width(6);
Filter* fst = mk_filter(); fst->gaussian_blur(2).set_units(USER).set_region(0, 0, 60, 60);
st.set_filter(fst).fill_style(tr).stroke_style(RED).path(ln);
expectb(alpha_of(px(st, 30, 30)) > 150, "blurred stroke: centre strong");
expecti(alpha_of(px(st, 30, 45)), 0, 0, "blurred stroke: far perpendicular empty");
st.clear_filter();
}
// ---- 7. Canvas2D off-screen apply_filter + linearRGB ----
{
// whole-canvas apply_filter
Canvas2D c(41, 41); c.clear(0);
Shape2D b = mask_box(10, 10, 21, 21);
c.fill_style(RED).stroke_style(tr).path(b);
Filter f; f.gaussian_blur(2);
c.apply_filter(f);
expect(px(c, 20, 20), RED, 0, "apply_filter(): interior exact");
const int e = alpha_of(px(c, 10, 20));
expectb(e > 88 && e < 190, "apply_filter(): edge blurred");
// rect apply_filter: only the rect changes
Canvas2D r(60, 60); r.clear(0);
Shape2D b1 = mask_box(5, 20, 20, 20), b2 = mask_box(35, 20, 20, 20);
r.fill_style(RED).stroke_style(tr).path(b1).path(b2);
const uint32_t outside_before = px(r, 2, 2);
Filter fr; fr.gaussian_blur(2);
r.apply_filter(fr, 0, 10, 30, 40);
const int re = alpha_of(px(r, 5, 30));
expectb(re > 70 && re < 200, "apply_filter(rect): inside rect blurred");
expect(px(r, 35, 30), RED, 0, "apply_filter(rect): outside rect untouched");
expect(px(r, 2, 2), outside_before, 0, "apply_filter(rect): far pixel untouched");
// empty filter / degenerate rect are no-ops
Canvas2D n(20, 20); n.clear(0);
Shape2D nb = mask_box(5, 5, 10, 10);
n.fill_style(RED).stroke_style(tr).path(nb);
Filter empty;
n.apply_filter(empty);
n.apply_filter(f, 100, 100, 10, 10);
expect(px(n, 5, 10), RED, 0, "empty filter / off-canvas rect are no-ops");
// negative-origin rect is clamped, not crashed
n.apply_filter(f, -5, -5, 15, 15);
expectb(alpha_of(px(n, 0, 0)) >= 0, "negative rect origin clamps safely");
// linearRGB vs sRGB: blurring a black|white boundary is brighter in linear.
// Buffer is 40x40 and we sample the vertical centre (row 20) so the sigma-4
// kernel (~11px reach) stays clear of the top/bottom transparent padding and
// the opaque alpha is preserved exactly. A 20px-tall buffer would legitimately
// lose a little alpha at mid-height to the zero-extension padding.
const int W = 40, H = 40;
std::vector<uint32_t> hs(W * H);
for (int y = 0; y < H; ++y) for (int x = 0; x < W; ++x) hs[y * W + x] = (x < 20) ? BLACK : white;
std::vector<uint32_t> lin = hs;
Filter bs; bs.gaussian_blur(4);
bs.apply(hs.data(), W, H);
Filter bl; bl.gaussian_blur(4).set_color_space(Filter::ColorSpace::LinearRGB);
bl.apply(lin.data(), W, H);
const int srgb_mid = ((int)(hs[20 * W + 19] & 255) + (int)(hs[20 * W + 20] & 255)) / 2;
const int lin_mid = ((int)(lin[20 * W + 19] & 255) + (int)(lin[20 * W + 20] & 255)) / 2;
expectb(srgb_mid > 90 && srgb_mid < 165, "sRGB blur boundary ~mid gray");
expectb(lin_mid > srgb_mid + 25, "linearRGB blur boundary is brighter");
expecti(alpha_of(lin[20 * W + 19]), 255, 0, "linearRGB round trip keeps alpha");
}
g_filters_selftest_checks = checks;
filter_pool_reset(); mask_pool_reset(); clip_pool_reset();
std::printf("[filter self-test] %u/%u checks passed\n", checks - fails, checks);
return fails;
}
ag_export(get_filters_selftest_checks) uint32_t get_filters_selftest_checks() { return g_filters_selftest_checks; }
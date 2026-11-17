// ./canvas_test_composite.hpp
// Test 19: SVG 2 globalCompositeOperation (Porter-Duff) demo + numeric self-tests.
// INCLUDED by canvas_test.cpp (single translation unit) - not standalone.
// Must be included AFTER canvas_test_svg.hpp / canvas_test_fillrule.hpp: reuses
// mask_box/mask_disc, the mk_mask/mk_clip/mk_lin heap pools and the pool resets.
//
// Coverage:
//   demo 1 : source-over / source-in / source-out / source-atop
//   demo 2 : destination-over / destination-in / destination-out / destination-atop
//   demo 3 : clear / copy / blend+op (multiply x source-atop) / gradient copy
//   demo 4 : op + clip-path, op + mask, op + shadow, op + save/restore
//   demo 5 : op + text, op + image(pixels), destination-out stroke erase, op + CTM
// Each tile is rendered on its own transparent Canvas2D (blue disc destination +
// orange rect source) and blitted over a checkerboard so transparency is visible.
//
// NOTE on unbounded operators: source-in / source-out / destination-in /
// destination-atop / copy / clear rewrite the WHOLE canvas. In particular
// source-out clears the destination even outside the source (Fb = 0), so the
// destination-only region must be transparent, NOT preserved.
#pragma once
static uint32_t g_composite_selftest_checks = 0;
// Render one Porter-Duff tile: blue disc (destination) then orange rect (source)
// with the given operator, on a transparent offscreen canvas, then blit onto c.
static void pd_tile(Canvas2D& c, float x, float y, float w, float h,
CompositeOp op, BlendMode mode = BlendMode::Normal) {
const int tw = std::max(1, (int)std::lround(w)), th = std::max(1, (int)std::lround(h));
Canvas2D t(tw, th);                       // transparent (calloc zero)
const uint32_t tr = rgba(0,0,0,0);
Shape2D d = mask_disc(w * 0.38f, h * 0.42f, h * 0.34f);
t.fill_style(rgba(70,130,255,255)).stroke_style(tr).path(d);
Shape2D sr = mask_box(w * 0.42f, h * 0.30f, w * 0.42f, h * 0.52f);
t.composite_op(op).blend_mode(mode).fill_style(rgba(255,150,50,255)).stroke_style(tr).path(sr);
c.draw_pixels(t.get_buffer(), tw, th, x, y, w, h);
}
ag_export(run_composite_demo)
uint32_t run_composite_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 700; height = 820; }
if (g_composite_canvas) delete g_composite_canvas;
g_composite_canvas = new Canvas2D(width, height);
Canvas2D& c = *g_composite_canvas;
mask_pool_reset();
clip_pool_reset();
const float s = std::min(width / 700.0f, height / 820.0f);
const uint32_t bg = rgba(24,28,36,255), tr = rgba(0,0,0,0), guide = rgba(90,90,110,90);
const uint32_t dim = rgba(175,180,195,255), head = rgba(120,200,255,255), white = rgba(255,255,255,255);
const float TW = 150.0f, TH = 90.0f, CX[4] = {30.0f, 195.0f, 360.0f, 525.0f};
c.clear(bg);
c.save();
c.scale(s, s);
c.fill_style(tr).stroke_style(guide);
for (int gx = 0; gx <= 700; gx += 50) { Shape2D p; p.mt(gx,0).lt(gx,820).set_line_width(0.5f); c.path(p); }
for (int gy = 0; gy <= 820; gy += 50) { Shape2D p; p.mt(0,gy).lt(700,gy).set_line_width(0.5f); c.path(p); }
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
// ---- 1. source family ----
section("1. Porter-Duff: source family", 34);
{
const float y = 48;
const CompositeOp ops[4] = {CompositeOp::SourceOver, CompositeOp::SourceIn, CompositeOp::SourceOut, CompositeOp::SourceAtop};
const char* names[4] = {"source-over", "source-in", "source-out", "source-atop"};
for (int i = 0; i < 4; ++i) { checker(CX[i], y, TW, TH); pd_tile(c, CX[i], y, TW, TH, ops[i]); label(names[i], CX[i], y + TH + 20, 19, dim); }
}
// ---- 2. destination family ----
section("2. Porter-Duff: destination family", 190);
{
const float y = 204;
const CompositeOp ops[4] = {CompositeOp::DestinationOver, CompositeOp::DestinationIn, CompositeOp::DestinationOut, CompositeOp::DestinationAtop};
const char* names[4] = {"destination-over", "destination-in", "destination-out", "destination-atop"};
for (int i = 0; i < 4; ++i) { checker(CX[i], y, TW, TH); pd_tile(c, CX[i], y, TW, TH, ops[i]); label(names[i], CX[i], y + TH + 20, 19, dim); }
}
// ---- 3. clear / copy / blend+op / gradient copy ----
section("3. clear / copy / blend x op / gradient", 346);
{
const float y = 360;
checker(CX[0], y, TW, TH); pd_tile(c, CX[0], y, TW, TH, CompositeOp::Clear); label("clear", CX[0], y + TH + 20, 19, dim);
checker(CX[1], y, TW, TH); pd_tile(c, CX[1], y, TW, TH, CompositeOp::Copy); label("copy", CX[1], y + TH + 20, 19, dim);
checker(CX[2], y, TW, TH); pd_tile(c, CX[2], y, TW, TH, CompositeOp::SourceAtop, BlendMode::Multiply); label("multiply x source-atop", CX[2], y + TH + 20, 19, dim);
checker(CX[3], y, TW, TH);
{
const int tw = (int)TW, th = (int)TH;
Canvas2D t(tw, th);
Shape2D d = mask_disc(TW * 0.38f, TH * 0.42f, TH * 0.34f);
t.fill_style(rgba(70,130,255,255)).stroke_style(tr).path(d);
LinearGradient* g = mk_lin(TW * 0.42f, 0, TW * 0.84f, 0);
g->add_stop(0, rgba(255,80,80,255)).add_stop(1, rgba(80,220,255,255));
Shape2D sr = mask_box(TW * 0.42f, TH * 0.30f, TW * 0.42f, TH * 0.52f);
t.composite_op(CompositeOp::Copy).fill_style(g).stroke_style(tr).path(sr);
c.draw_pixels(t.get_buffer(), tw, th, CX[3], y, TW, TH);
}
label("copy + gradient source", CX[3], y + TH + 20, 19, dim);
}
// ---- 4. op + clip / mask / shadow / save-restore ----
section("4. op + clip-path / mask / shadow / save-restore", 502);
{
const float y = 516;
checker(CX[0], y, TW, TH);
{
const int tw = (int)TW, th = (int)TH;
Canvas2D t(tw, th);
Shape2D d = mask_disc(TW * 0.38f, TH * 0.42f, TH * 0.34f);
t.fill_style(rgba(70,130,255,255)).stroke_style(tr).path(d);
Shape2D win = mask_box(TW * 0.5f, 0, TW * 0.5f, TH);       // named: outlives the draw
ClipPath* cp = mk_clip(); cp->add(win);
Shape2D sr = mask_box(TW * 0.42f, TH * 0.30f, TW * 0.42f, TH * 0.52f);
t.set_clip(cp).composite_op(CompositeOp::DestinationIn).fill_style(rgba(255,150,50,255)).stroke_style(tr).path(sr);
t.clear_clip();
c.draw_pixels(t.get_buffer(), tw, th, CX[0], y, TW, TH);
}
label("destination-in + clip", CX[0], y + TH + 20, 19, dim);
checker(CX[1], y, TW, TH);
{
const int tw = (int)TW, th = (int)TH;
Canvas2D t(tw, th);
Shape2D d = mask_disc(TW * 0.38f, TH * 0.42f, TH * 0.34f);
t.fill_style(rgba(70,130,255,255)).stroke_style(tr).path(d);
Shape2D full = mask_box(0, 0, TW, TH);                     // named: outlives the draw
Mask* m = mk_mask();
m->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(0, 0, TW, TH)
.add_shape(full, Paint(rgba(255,255,255,128)));
Shape2D sr = mask_box(TW * 0.42f, TH * 0.30f, TW * 0.42f, TH * 0.52f);
t.set_mask(m).composite_op(CompositeOp::SourceIn).fill_style(rgba(255,150,50,255)).stroke_style(tr).path(sr);
t.clear_mask();
c.draw_pixels(t.get_buffer(), tw, th, CX[1], y, TW, TH);
}
label("source-in + alpha mask", CX[1], y + TH + 20, 19, dim);
checker(CX[2], y, TW, TH);
{
const int tw = (int)TW, th = (int)TH;
Canvas2D t(tw, th);
Shape2D d = mask_disc(TW * 0.38f, TH * 0.42f, TH * 0.34f);
t.fill_style(rgba(70,130,255,255)).stroke_style(tr).path(d);
Shape2D sr = mask_box(TW * 0.42f, TH * 0.30f, TW * 0.30f, TH * 0.40f);
t.drop_shadow(6, 5, 2, rgba(0,0,0,230)).composite_op(CompositeOp::Copy)
.fill_style(rgba(255,150,50,255)).stroke_style(tr).path(sr);
t.clear_shadow();
c.draw_pixels(t.get_buffer(), tw, th, CX[2], y, TW, TH);
}
label("copy + shadow (one source)", CX[2], y + TH + 20, 19, dim);
checker(CX[3], y, TW, TH);
{
const int tw = (int)TW, th = (int)TH;
Canvas2D t(tw, th);
Shape2D d = mask_disc(TW * 0.38f, TH * 0.42f, TH * 0.34f);
t.fill_style(rgba(70,130,255,255)).stroke_style(tr).path(d);
Shape2D sr = mask_box(TW * 0.42f, TH * 0.30f, TW * 0.42f, TH * 0.52f);
t.save();
t.composite_op(CompositeOp::SourceOut).fill_style(rgba(255,150,50,255)).stroke_style(tr).path(sr);
t.restore();                                               // pops the operator
Shape2D mark = mask_box(TW - 26, TH - 22, 16, 12);
t.fill_style(white).stroke_style(tr).path(mark);           // uncomposited proof
c.draw_pixels(t.get_buffer(), tw, th, CX[3], y, TW, TH);
}
label("source-out + save/restore", CX[3], y + TH + 20, 19, dim);
}
// ---- 5. op + text / image / stroke erase / CTM ----
section("5. op + text / image / stroke erase / CTM", 658);
{
const float y = 672;
checker(CX[0], y, TW, TH);
{
const int tw = (int)TW, th = (int)TH;
Canvas2D t(tw, th);
Shape2D band = mask_box(0, TH * 0.2f, TW, TH * 0.6f);
t.fill_style(rgba(70,130,255,255)).stroke_style(tr).path(band);
t.composite_op(CompositeOp::SourceIn);
if (g_font) {
g_font->set_pixel_height(56);
t.font(g_font).fill_style(rgba(255,150,50,255)).stroke_style(tr).fill_text("PD", 20, TH * 0.72f);
} else {
Shape2D fb = mask_box(TW * 0.2f, TH * 0.3f, TW * 0.6f, TH * 0.4f);
t.fill_style(rgba(255,150,50,255)).stroke_style(tr).path(fb);
}
c.draw_pixels(t.get_buffer(), tw, th, CX[0], y, TW, TH);
}
label(g_font ? "source-in + fill_text" : "run Font Test first", CX[0], y + TH + 20, 19, dim);
checker(CX[1], y, TW, TH);
{
const int tw = (int)TW, th = (int)TH;
Canvas2D t(tw, th);
Shape2D d = mask_disc(TW * 0.38f, TH * 0.42f, TH * 0.34f);
t.fill_style(rgba(70,130,255,255)).stroke_style(tr).path(d);
uint32_t px[64];
for (int i = 0; i < 64; ++i) px[i] = (((i % 8) + (i / 8)) % 2 == 0) ? rgba(255,150,50,255) : rgba(255,220,120,255);
t.composite_op(CompositeOp::DestinationAtop).draw_pixels(px, 8, 8, TW * 0.42f, TH * 0.30f, TW * 0.42f, TH * 0.52f);
c.draw_pixels(t.get_buffer(), tw, th, CX[1], y, TW, TH);
}
label("destination-atop + pixels", CX[1], y + TH + 20, 19, dim);
checker(CX[2], y, TW, TH);
{
const int tw = (int)TW, th = (int)TH;
Canvas2D t(tw, th);
Shape2D r = mask_box(0, 0, TW, TH);
t.fill_style(rgba(70,130,255,255)).stroke_style(tr).path(r);
Shape2D line; line.mt(10, TH * 0.5f).lt(TW - 10, TH * 0.5f)
.set_line_width(16).set_line_cap(Shape2D::CAP_ROUND).set_dash_array({18,10});
t.composite_op(CompositeOp::DestinationOut).fill_style(tr).stroke_style(rgba(0,0,0,255)).path(line);
c.draw_pixels(t.get_buffer(), tw, th, CX[2], y, TW, TH);
}
label("destination-out erase", CX[2], y + TH + 20, 19, dim);
checker(CX[3], y, TW, TH);
{
const int tw = (int)TW, th = (int)TH;
Canvas2D t(tw, th);
Shape2D d = mask_disc(TW * 0.38f, TH * 0.42f, TH * 0.34f);
t.fill_style(rgba(70,130,255,255)).stroke_style(tr).path(d);
t.save();
t.translate(TW * 0.5f, TH * 0.5f); t.rotate(0.5f);
Shape2D sr = mask_box(-TW * 0.2f, -TH * 0.2f, TW * 0.4f, TH * 0.4f);
t.composite_op(CompositeOp::SourceAtop).fill_style(rgba(255,150,50,255)).stroke_style(tr).path(sr);
t.restore();
c.draw_pixels(t.get_buffer(), tw, th, CX[3], y, TW, TH);
}
label("source-atop + CTM", CX[3], y + TH + 20, 19, dim);
}
c.restore();
c.composite_op(CompositeOp::SourceOver).blend_mode(BlendMode::Normal).fill_style(tr).stroke_style(tr);
mask_pool_reset();
clip_pool_reset();
return 1;
}
// ============================================================================
// TEST 19b - NUMERIC COMPOSITE SELF-TEST (returns the failure count, 0 = pass)
// ============================================================================
ag_export(run_composite_selftest)
uint32_t run_composite_selftest() {
mask_pool_reset();
clip_pool_reset();
uint32_t fails = 0, checks = 0;
const uint32_t tr = rgba(0,0,0,0), white = rgba(255,255,255,255);
const uint32_t BLUE = rgba(0,0,255,255), RED = rgba(255,0,0,255);
auto alpha_of = [](uint32_t v) { return (int)(v >> 24); };
auto expect_px = [&](uint32_t got, uint32_t want, int tol, const char* name) {
++checks;
const int wa = (int)(want >> 24);
const int da = std::abs((int)(got >> 24) - wa);
bool bad = da > tol;
if (wa != 0) {
bad = bad || std::abs((int)(got & 255) - (int)(want & 255)) > tol
|| std::abs((int)((got >> 8) & 255) - (int)((want >> 8) & 255)) > tol
|| std::abs((int)((got >> 16) & 255) - (int)((want >> 16) & 255)) > tol;
}
if (bad) { ++fails; std::printf("[composite self-test] FAIL %s: got 0x%08X, want 0x%08X (+/-%d)\n", name, got, want, tol); }
};
// Layout: 40x20 canvas. Destination = left half x[0,20); source = x[10,30).
// Sample row y=10: A=x5 (dest only), B=x15 (overlap), C=x25 (source only),
// D=x35 (neither). Unbounded operators must also rewrite A and D.
auto setup = [&](Canvas2D& c, uint32_t dc, uint32_t sc, CompositeOp op, BlendMode mode = BlendMode::Normal) {
Shape2D d = mask_box(0, 0, 20, 20);
c.fill_style(dc).stroke_style(tr).path(d);
Shape2D sr = mask_box(10, 0, 20, 20);
c.composite_op(op).blend_mode(mode).fill_style(sc).stroke_style(tr).path(sr);
c.composite_op(CompositeOp::SourceOver).blend_mode(BlendMode::Normal);
};
// 1. default operator + alias equivalence
{
Canvas2D c(40, 20); c.clear(0);
expect_px((uint32_t)c.composite_op(), (uint32_t)CompositeOp::SourceOver, 0, "default op is source-over");
c.global_composite_operation(CompositeOp::Copy);
expect_px((uint32_t)c.composite_op(), (uint32_t)CompositeOp::Copy, 0, "alias setter/getter");
}
// 2. opaque source + opaque destination: full 4-region matrix for all 10 ops.
//    Truth table verified against the Porter-Duff Fa/Fb formulas. Remember:
//    source-out has Fb=0, so the destination-only region A is CLEARED (0).
{
struct Row { CompositeOp op; uint32_t a, b, cc, d; const char* name; };
const Row rows[10] = {
{CompositeOp::SourceOver,      BLUE, RED,  RED,  0, "source-over"},
{CompositeOp::SourceIn,        0,    RED,  0,    0, "source-in"},
{CompositeOp::SourceOut,       0,    0,    RED,  0, "source-out"},
{CompositeOp::SourceAtop,      BLUE, RED,  0,    0, "source-atop"},
{CompositeOp::DestinationOver, BLUE, BLUE, RED,  0, "destination-over"},
{CompositeOp::DestinationIn,   0,    BLUE, 0,    0, "destination-in"},
{CompositeOp::DestinationOut,  BLUE, 0,    0,    0, "destination-out"},
{CompositeOp::DestinationAtop, 0,    BLUE, RED,  0, "destination-atop"},
{CompositeOp::Clear,           0,    0,    0,    0, "clear"},
{CompositeOp::Copy,            0,    RED,  RED,  0, "copy"},
};
for (const Row& r : rows) {
Canvas2D c(40, 20); c.clear(0);
setup(c, BLUE, RED, r.op);
const uint32_t* buf = c.get_buffer();
expect_px(buf[10*40+5],  r.a,  0, r.name);
expect_px(buf[10*40+15], r.b,  0, r.name);
expect_px(buf[10*40+25], r.cc, 0, r.name);
expect_px(buf[10*40+35], r.d,  0, r.name);
}
}
// 3. semi-transparent source (alpha 128) over opaque destination
{
const uint32_t S = rgba(255,0,0,128);
Canvas2D a(40,20); a.clear(0); setup(a, BLUE, S, CompositeOp::SourceIn);
expect_px(a.get_buffer()[10*40+15], rgba(255,0,0,128), 1, "semi src source-in B");
Canvas2D b(40,20); b.clear(0); setup(b, BLUE, S, CompositeOp::SourceOut);
expect_px(alpha_of(b.get_buffer()[10*40+15]), 0, 0, "semi src source-out B empty");
expect_px(b.get_buffer()[10*40+25], rgba(255,0,0,128), 1, "semi src source-out C");
Canvas2D d(40,20); d.clear(0); setup(d, BLUE, S, CompositeOp::SourceAtop);
expect_px(d.get_buffer()[10*40+15], rgba(128,0,128,255), 2, "semi src source-atop B");
Canvas2D e(40,20); e.clear(0); setup(e, BLUE, S, CompositeOp::DestinationOver);
expect_px(e.get_buffer()[10*40+15], BLUE, 0, "semi src destination-over B");
Canvas2D f(40,20); f.clear(0); setup(f, BLUE, S, CompositeOp::DestinationIn);
expect_px(f.get_buffer()[10*40+15], rgba(0,0,255,128), 1, "semi src destination-in B");
Canvas2D g(40,20); g.clear(0); setup(g, BLUE, S, CompositeOp::DestinationOut);
expect_px(g.get_buffer()[10*40+15], rgba(0,0,255,127), 1, "semi src destination-out B");
Canvas2D h(40,20); h.clear(0); setup(h, BLUE, S, CompositeOp::DestinationAtop);
expect_px(h.get_buffer()[10*40+15], rgba(0,0,255,128), 1, "semi src destination-atop B");
expect_px(h.get_buffer()[10*40+25], rgba(255,0,0,128), 1, "semi src destination-atop C");
Canvas2D i(40,20); i.clear(0); setup(i, BLUE, S, CompositeOp::Copy);
expect_px(i.get_buffer()[10*40+15], rgba(255,0,0,128), 1, "semi src copy B");
}
// 4. opaque source over semi-transparent destination (alpha 128)
{
const uint32_t D = rgba(0,0,255,128);
Canvas2D a(40,20); a.clear(0); setup(a, D, RED, CompositeOp::SourceIn);
expect_px(a.get_buffer()[10*40+15], rgba(255,0,0,128), 1, "semi dst source-in B");
Canvas2D b(40,20); b.clear(0); setup(b, D, RED, CompositeOp::SourceAtop);
expect_px(b.get_buffer()[10*40+15], rgba(255,0,0,128), 1, "semi dst source-atop B");
Canvas2D d(40,20); d.clear(0); setup(d, D, RED, CompositeOp::DestinationOver);
expect_px(d.get_buffer()[10*40+15], rgba(128,0,128,255), 2, "semi dst destination-over B");
Canvas2D e(40,20); e.clear(0); setup(e, D, RED, CompositeOp::DestinationAtop);
expect_px(e.get_buffer()[10*40+15], rgba(128,0,128,255), 2, "semi dst destination-atop B");
Canvas2D f(40,20); f.clear(0); setup(f, D, RED, CompositeOp::DestinationIn);
expect_px(f.get_buffer()[10*40+15], rgba(0,0,255,128), 1, "semi dst destination-in B");
}
// 5. save/restore pops the operator
{
Canvas2D c(40,20); c.clear(0);
c.save();
c.composite_op(CompositeOp::Copy);
c.restore();
expect_px((uint32_t)c.composite_op(), (uint32_t)CompositeOp::SourceOver, 0, "restore pops op");
Shape2D d = mask_box(0,0,20,20);
c.fill_style(BLUE).stroke_style(tr).path(d);
Shape2D sr = mask_box(10,0,20,20);
c.fill_style(RED).stroke_style(tr).path(sr);
expect_px(c.get_buffer()[10*40+5], BLUE, 0, "source-over after restore A");
}
// 6. blend mode x operator: multiply x source-atop (red*blue = black)
{
Canvas2D c(40,20); c.clear(0);
setup(c, BLUE, RED, CompositeOp::SourceAtop, BlendMode::Multiply);
expect_px(c.get_buffer()[10*40+15], rgba(0,0,0,255), 1, "multiply x source-atop B black");
expect_px(c.get_buffer()[10*40+5], BLUE, 0, "multiply x source-atop A unchanged");
expect_px(alpha_of(c.get_buffer()[10*40+25]), 0, 0, "multiply x source-atop C empty");
}
// 7. operator + clip-path: destination-in with a clip on the source
{
Canvas2D c(40,20); c.clear(0);
Shape2D d = mask_box(0,0,20,20);
c.fill_style(BLUE).stroke_style(tr).path(d);
Shape2D win = mask_box(15,0,25,20);                        // named: outlives the draw
ClipPath* cp = mk_clip(); cp->add(win);
Shape2D sr = mask_box(10,0,20,20);
c.set_clip(cp).composite_op(CompositeOp::DestinationIn).fill_style(RED).stroke_style(tr).path(sr);
c.clear_clip();
expect_px(c.get_buffer()[10*40+17], BLUE, 0, "op+clip dest survives in clip");
expect_px(alpha_of(c.get_buffer()[10*40+5]), 0, 0, "op+clip dest cleared left");
expect_px(alpha_of(c.get_buffer()[10*40+12]), 0, 0, "op+clip dest cleared outside clip");
expect_px(alpha_of(c.get_buffer()[10*40+25]), 0, 0, "op+clip source-only cleared");
}
// 8. operator + alpha mask: source-in with a 128 alpha mask
{
Canvas2D c(40,20); c.clear(0);
Shape2D d = mask_box(0,0,20,20);
c.fill_style(BLUE).stroke_style(tr).path(d);
Shape2D full = mask_box(0,0,40,20);                        // named: outlives the draw
Mask* m = mk_mask();
m->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,40,20)
.add_shape(full, Paint(rgba(255,255,255,128)));
Shape2D sr = mask_box(10,0,20,20);
c.set_mask(m).composite_op(CompositeOp::SourceIn).fill_style(RED).stroke_style(tr).path(sr);
c.clear_mask();
expect_px(c.get_buffer()[10*40+15], rgba(255,0,0,128), 1, "op+mask source-in B");
expect_px(alpha_of(c.get_buffer()[10*40+5]), 0, 0, "op+mask A cleared");
expect_px(alpha_of(c.get_buffer()[10*40+25]), 0, 0, "op+mask C cleared");
}
// 9. operator + shadow: copy treats shadow+shape as ONE source
{
Canvas2D c(40,20); c.clear(0);
Shape2D d = mask_box(0,0,20,20);
c.fill_style(BLUE).stroke_style(tr).path(d);
Shape2D sr = mask_box(10,0,20,20);
c.drop_shadow(6,0,0, rgba(0,255,0,255)).composite_op(CompositeOp::Copy)
.fill_style(RED).stroke_style(tr).path(sr);
c.clear_shadow();
expect_px(c.get_buffer()[10*40+33], rgba(0,255,0,255), 1, "op+shadow shadow-only region");
expect_px(c.get_buffer()[10*40+15], RED, 0, "op+shadow shape over shadow");
expect_px(alpha_of(c.get_buffer()[10*40+5]), 0, 0, "op+shadow dest-only cleared");
}
// 10. draw_pixels honours the operator (source-in)
{
Canvas2D c(40,20); c.clear(0);
Shape2D d = mask_box(0,0,40,20);
c.fill_style(BLUE).stroke_style(tr).path(d);
uint32_t px[4] = {white, white, white, white};
c.composite_op(CompositeOp::SourceIn).draw_pixels(px, 2, 2, 10, 0, 20, 20);
expect_px(c.get_buffer()[10*40+15], white, 0, "draw_pixels source-in B");
expect_px(alpha_of(c.get_buffer()[10*40+5]), 0, 0, "draw_pixels source-in A cleared");
expect_px(alpha_of(c.get_buffer()[10*40+35]), 0, 0, "draw_pixels source-in D cleared");
}
// 11. draw_shape (Font2D-style direct path) honours the operator (copy)
{
Canvas2D c(40,20); c.clear(0);
Shape2D d = mask_box(0,0,20,20);
c.fill_style(BLUE).stroke_style(tr).path(d);
Shape2D sr = mask_box(10,0,20,20); sr.compile();
c.composite_op(CompositeOp::Copy).draw_shape(sr, Paint(RED), Paint(tr));
expect_px(c.get_buffer()[10*40+15], RED, 0, "draw_shape copy B");
expect_px(c.get_buffer()[10*40+25], RED, 0, "draw_shape copy C");
expect_px(alpha_of(c.get_buffer()[10*40+5]), 0, 0, "draw_shape copy A cleared");
}
// 12. destination-out stroke acts as an eraser
{
Canvas2D c(40,20); c.clear(0);
Shape2D d = mask_box(0,0,40,20);
c.fill_style(BLUE).stroke_style(tr).path(d);
Shape2D line; line.mt(0,10).lt(40,10).set_line_width(8);
c.composite_op(CompositeOp::DestinationOut).fill_style(tr).stroke_style(rgba(0,0,0,255)).path(line);
expect_px(alpha_of(c.get_buffer()[10*40+20]), 0, 0, "erase stroke centre");
expect_px(c.get_buffer()[2*40+20], BLUE, 0, "erase stroke above intact");
expect_px(c.get_buffer()[18*40+20], BLUE, 0, "erase stroke below intact");
}
// 13. operator under the CTM (translate)
{
Canvas2D c(40,20); c.clear(0);
Shape2D d = mask_box(0,0,20,20);
c.fill_style(BLUE).stroke_style(tr).path(d);
c.save();
c.translate(10, 0);
Shape2D sr = mask_box(0,0,20,20);
c.composite_op(CompositeOp::SourceIn).fill_style(RED).stroke_style(tr).path(sr);
c.restore();
expect_px(c.get_buffer()[10*40+15], RED, 0, "CTM source-in B");
expect_px(alpha_of(c.get_buffer()[10*40+5]), 0, 0, "CTM source-in A cleared");
expect_px(alpha_of(c.get_buffer()[10*40+25]), 0, 0, "CTM source-in C cleared");
}
// 14. gradient source with copy
{
Canvas2D c(40,20); c.clear(0);
Shape2D d = mask_box(0,0,20,20);
c.fill_style(BLUE).stroke_style(tr).path(d);
LinearGradient* g = mk_lin(10, 0, 30, 0);
g->add_stop(0, RED).add_stop(1, BLUE);
Shape2D sr = mask_box(10,0,20,20);
c.composite_op(CompositeOp::Copy).fill_style(g).stroke_style(tr).path(sr);
expect_px(c.get_buffer()[10*40+11], rgba(242,0,13,255), 10, "gradient copy near start");
expect_px(c.get_buffer()[10*40+28], rgba(13,0,242,255), 10, "gradient copy near end");
}
// 15. regression: default source-over fill unchanged, exact straight colour
{
Canvas2D c(50,50); c.clear(0);
Shape2D b = mask_box(10,10,30,30);
c.fill_style(rgba(10,20,30,255)).stroke_style(tr).path(b);
expect_px(c.get_buffer()[25*50+25], rgba(10,20,30,255), 0, "source-over fill unchanged");
expect_px(alpha_of(c.get_buffer()[5*50+5]), 0, 0, "source-over outside unchanged");
}
g_composite_selftest_checks = checks;
mask_pool_reset();
clip_pool_reset();
std::printf("[composite self-test] %u/%u checks passed\n", checks - fails, checks);
return fails;
}
ag_export(get_composite_selftest_checks) uint32_t get_composite_selftest_checks() { return g_composite_selftest_checks; }
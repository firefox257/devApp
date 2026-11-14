// ./canvas_test_markers.hpp
// Test 20: SVG 2 markers (marker-start / marker-mid / marker-end) demo + tests.
// INCLUDED by canvas_test.cpp (single translation unit) - not standalone.
// Must be included AFTER canvas_test_svg.hpp: reuses mk_mask/mk_clip/mk_lin and
// the mask/clip pool resets. Marker objects use their own heap pool.
//
// Coverage:
//   demo 1 : start/mid/end vertices, closed subpath, two subpaths
//   demo 2 : orient auto / auto-start-reverse / fixed angle
//   demo 3 : refX / refY anchoring (tip / centre / tail)
//   demo 4 : markerUnits strokeWidth vs userSpaceOnUse, viewport clip/overflow
//   demo 5 : viewBox + preserveAspectRatio (meet / slice)
//   demo 6 : curve & arc tangents, mask, context-stroke + clip-path
#pragma once
static uint32_t g_markers_selftest_checks = 0;
static std::vector<Marker*> g_marker_pool;
static Marker* mk_marker() { g_marker_pool.push_back(new Marker()); return g_marker_pool.back(); }
static void marker_pool_reset() { for (Marker* m : g_marker_pool) delete m; g_marker_pool.clear(); }
static Shape2D mkr_box(float x, float y, float w, float h) {
Shape2D s; s.mt(x, y).lt(x + w, y).lt(x + w, y + h).lt(x, y + h).close(); return s;
}
// Marker content: function-local statics, so it outlives every draw call.
static const Shape2D& mkr_tri() { static const Shape2D s = [] { Shape2D t; t.mt(0,0).lt(10,5).lt(0,10).close(); return t; }(); return s; }
static const Shape2D& mkr_sq() { static const Shape2D s = mkr_box(0,0,10,10); return s; }
static const Shape2D& mkr_sq20() { static const Shape2D s = mkr_box(0,0,20,20); return s; }
static const Shape2D& mkr_dot() { static const Shape2D s = [] { Shape2D t; t.at(5,5,5,0.0f,6.283185307179586f,false); return t; }(); return s; }
static const Shape2D& mkr_ring() { static const Shape2D s = [] { Shape2D t = mkr_box(0,0,10,10); t.set_line_width(2); return t; }(); return s; }
static Marker* mkr_make(const Shape2D& s, uint32_t color, float w, float h, float rx, float ry, bool user_units = true) {
Marker* m = mk_marker();
m->set_size(w, h).set_ref(rx, ry).set_orient_auto().add(s, Paint(color));
if (user_units) m->set_units(Marker::Units::UserSpaceOnUse);
return m;
}
ag_export(run_markers_demo)
uint32_t run_markers_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 700; height = 980; }
if (g_markers_canvas) delete g_markers_canvas;
g_markers_canvas = new Canvas2D(width, height);
Canvas2D& c = *g_markers_canvas;
marker_pool_reset(); mask_pool_reset(); clip_pool_reset();
const float s = std::min(width / 700.0f, height / 980.0f);
const uint32_t bg = rgba(24,28,36,255), tr = rgba(0,0,0,0), guide = rgba(90,90,110,90);
const uint32_t dim = rgba(175,180,195,255), head = rgba(120,200,255,255), white = rgba(255,255,255,255);
const uint32_t red = rgba(255,90,80,255), grn = rgba(90,230,140,255), blu = rgba(90,170,255,255), yel = rgba(255,210,90,255);
const float TW = 200.0f, TH = 90.0f, CX[3] = {30.0f, 250.0f, 470.0f};
c.clear(bg);
c.save(); c.scale(s, s);
c.fill_style(tr).stroke_style(guide);
for (int gx = 0; gx <= 700; gx += 50) { Shape2D p; p.mt(gx,0).lt(gx,980).set_line_width(0.5f); c.path(p); }
for (int gy = 0; gy <= 980; gy += 50) { Shape2D p; p.mt(0,gy).lt(700,gy).set_line_width(0.5f); c.path(p); }
auto label = [&](const char* txt, float x, float y, float px, uint32_t col) {
if (!g_font) return;
g_font->set_pixel_height(px);
c.font(g_font).fill_style(col).stroke_style(tr).fill_text(txt, x, y);
};
auto section = [&](const char* txt, float y) { label(txt, 30, y, 26, head); };
auto line = [&](float x0, float y0, float x1, float y1, float w, uint32_t col) {
Shape2D p; p.mt(x0,y0).lt(x1,y1).set_line_width(w);
c.fill_style(tr).stroke_style(col).path(p);
};
// NOTE: label() rewrites fill_style/stroke_style for the caption glyphs, so every
// shape draw below re-asserts its own styles immediately before c.path(...).
// ---- 1. vertex placement ----
section("1. marker-start / marker-mid / marker-end", 34);
{
const float y = 48;
c.set_markers(mkr_make(mkr_dot(), red, 12, 12, 5, 5), mkr_make(mkr_dot(), grn, 8, 8, 5, 5), mkr_make(mkr_tri(), blu, 14, 14, 10, 5));
Shape2D p; p.mt(CX[0]+15,y+70).lt(CX[0]+70,y+25).lt(CX[0]+130,y+65).lt(CX[0]+185,y+30).set_line_width(2);
c.fill_style(tr).stroke_style(dim).path(p);
label("start / mid / end", CX[0], y+TH+20, 19, dim);
Shape2D t; t.mt(CX[1]+30,y+70).lt(CX[1]+170,y+70).lt(CX[1]+100,y+20).close().set_line_width(2);
c.fill_style(tr).stroke_style(dim).path(t);
label("closed: end over start", CX[1], y+TH+20, 19, dim);
Shape2D u; u.mt(CX[2]+15,y+35).lt(CX[2]+90,y+35).mt(CX[2]+110,y+65).lt(CX[2]+185,y+65).set_line_width(2);
c.fill_style(tr).stroke_style(dim).path(u);
label("2 subpaths: inner ends = mid", CX[2], y+TH+20, 19, dim);
c.clear_markers();
}
// ---- 2. orient ----
section("2. orient: auto / auto-start-reverse / angle", 190);
{
const float y = 204;
Marker* a = mkr_make(mkr_tri(), yel, 14, 14, 10, 5);
c.set_markers(a, nullptr, a);
line(CX[0]+25, y+45, CX[0]+175, y+45, 3, dim);
label("auto (start points inward)", CX[0], y+TH+20, 19, dim);
a->set_orient_auto_start_reverse();
line(CX[1]+25, y+45, CX[1]+175, y+45, 3, dim);
label("auto-start-reverse (outward)", CX[1], y+TH+20, 19, dim);
c.clear_markers();
const uint32_t cols[3] = {red, grn, blu};
for (int i = 0; i < 3; ++i) {
Marker* f = mkr_make(mkr_tri(), cols[i], 14, 14, 10, 5);
f->set_orient(i * 45.0f);
c.set_marker_end(f);
line(CX[2]+20, y+20+i*25, CX[2]+150, y+20+i*25, 2, dim);
}
c.clear_markers();
label("orient = 0 / 45 / 90 deg", CX[2], y+TH+20, 19, dim);
}
// ---- 3. refX / refY ----
section("3. refX / refY anchor point", 346);
{
const float y = 360;
const float refs[3] = {10.0f, 5.0f, 0.0f};
const char* names[3] = {"refX=10 (tip)", "refX=5 (centre)", "refX=0 (tail)"};
for (int i = 0; i < 3; ++i) {
c.set_marker_end(mkr_make(mkr_tri(), yel, 16, 16, refs[i], 5));
line(CX[i]+20, y+45, CX[i]+120, y+45, 3, dim);
c.clear_markers();
Shape2D d; d.at(CX[i]+120, y+45, 2.5f, 0.0f, 6.283185307179586f, false);
c.fill_style(white).stroke_style(tr).path(d);
label(names[i], CX[i], y+TH+20, 19, dim);
}
}
// ---- 4. markerUnits + viewport ----
section("4. markerUnits + markerWidth / markerHeight", 502);
{
const float y = 516;
const float w[3] = {2.0f, 4.0f, 8.0f};
c.set_marker_end(mkr_make(mkr_tri(), yel, 4, 4, 10, 5, false));      // strokeWidth
for (int i = 0; i < 3; ++i) line(CX[0]+20, y+18+i*26, CX[0]+170, y+18+i*26, w[i], dim);
label("markerUnits=strokeWidth", CX[0], y+TH+20, 19, dim);
c.set_marker_end(mkr_make(mkr_tri(), yel, 14, 14, 10, 5));           // userSpaceOnUse
for (int i = 0; i < 3; ++i) line(CX[1]+20, y+18+i*26, CX[1]+170, y+18+i*26, w[i], dim);
label("markerUnits=userSpaceOnUse", CX[1], y+TH+20, 19, dim);
Marker* cl = mkr_make(mkr_sq20(), red, 12, 12, 0, 0);
c.set_marker_end(cl);
line(CX[2]+20, y+25, CX[2]+110, y+25, 2, dim);
cl->set_overflow_visible();
line(CX[2]+20, y+65, CX[2]+110, y+65, 2, dim);
c.clear_markers();
label("viewport clip / overflow", CX[2], y+TH+20, 19, dim);
}
// ---- 5. viewBox ----
section("5. viewBox + preserveAspectRatio", 658);
{
const float y = 672;
Marker* a = mkr_make(mkr_sq(), grn, 30, 30, 5, 5); a->set_view_box(0,0,10,10);
c.set_marker_end(a); line(CX[0]+20, y+45, CX[0]+130, y+45, 2, dim);
label("viewBox 10x10 -> 30x30", CX[0], y+TH+20, 19, dim);
Marker* b = mkr_make(mkr_sq(), blu, 40, 20, 5, 5); b->set_view_box(0,0,10,10);
c.set_marker_end(b); line(CX[1]+20, y+45, CX[1]+130, y+45, 2, dim);
label("xMidYMid meet (letterbox)", CX[1], y+TH+20, 19, dim);
Marker* d = mkr_make(mkr_sq(), red, 40, 20, 5, 5);
d->set_view_box(0,0,10,10).set_preserve_aspect_ratio(Marker::Align::xMidYMid, Marker::Fit::Slice);
c.set_marker_end(d); line(CX[2]+20, y+45, CX[2]+130, y+45, 2, dim);
c.clear_markers();
label("xMidYMid slice (cropped)", CX[2], y+TH+20, 19, dim);
}
// ---- 6. curves / arcs / mask / context paint / clip ----
section("6. curve & arc tangents, mask, context-stroke + clip", 814);
{
const float y = 828;
Marker* a = mkr_make(mkr_tri(), yel, 14, 14, 10, 5);
c.set_markers(a, nullptr, a);
Shape2D cv; cv.mt(CX[0]+15,y+70).ct(CX[0]+60,y+10,CX[0]+120,y+90,CX[0]+180,y+30).set_line_width(2);
c.fill_style(tr).stroke_style(dim).path(cv);
c.clear_markers();
label("tangents on a cubic", CX[0], y+TH+20, 19, dim);
Shape2D mfull = mkr_box(CX[1], y, TW, TH);
LinearGradient* mg = mk_lin(CX[1], y, CX[1]+TW, y);
mg->add_stop(0, rgba(0,0,0,255)).add_stop(1, white);
Mask* mk = mk_mask();
mk->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[1], y, TW, TH).add_shape(mfull, Paint(mg));
Shape2D ar; ar.at(CX[1]+100, y+75, 45, 3.14159265f, 4.71238898f, false).set_line_width(2);
c.set_markers(a, nullptr, a).set_mask(mk).fill_style(tr).stroke_style(dim).path(ar);
c.clear_mask().clear_markers();
label("arc + luminance mask", CX[1], y+TH+20, 19, dim);
Marker* cs = mk_marker();
cs->set_units(Marker::Units::UserSpaceOnUse).set_size(16,16).set_ref(10,5).set_orient_auto().add_context(mkr_tri());
c.set_marker_end(cs);
Shape2D win = mkr_box(CX[2], y, TW*0.6f, TH);
ClipPath* cp = mk_clip(); cp->add(win);
c.set_clip(cp);
const uint32_t cols[3] = {red, grn, blu};
for (int i = 0; i < 3; ++i) line(CX[2]+15, y+18+i*22, CX[2]+100, y+18+i*22, 3, cols[i]);
line(CX[2]+15, y+84, CX[2]+185, y+84, 3, dim);   // end marker lands outside the clip
c.clear_clip().clear_markers();
label("context-stroke + clip-path", CX[2], y+TH+20, 19, dim);
}
c.restore();
c.fill_style(tr).stroke_style(tr).clear_markers();
marker_pool_reset(); mask_pool_reset(); clip_pool_reset();
return 1;
}
// ============================================================================
// TEST 20b - NUMERIC MARKER SELF-TEST (returns the failure count, 0 = pass)
// ============================================================================
ag_export(run_markers_selftest)
uint32_t run_markers_selftest() {
marker_pool_reset(); mask_pool_reset(); clip_pool_reset();
uint32_t fails = 0, checks = 0;
const uint32_t tr = rgba(0,0,0,0), white = rgba(255,255,255,255);
const uint32_t RED = rgba(255,0,0,255), GREEN = rgba(0,255,0,255), BLUE = rgba(0,0,255,255);
const Marker::Units USER = Marker::Units::UserSpaceOnUse;
auto px = [](Canvas2D& c, int x, int y) { return c.get_buffer()[(size_t)y * c.get_width() + x]; };
auto expect = [&](uint32_t got, uint32_t want, int tol, const char* name) {
++checks;
const int wa = (int)(want >> 24);
bool bad = std::abs((int)(got >> 24) - wa) > tol;
if (wa != 0) bad = bad || std::abs((int)(got & 255) - (int)(want & 255)) > tol
|| std::abs((int)((got >> 8) & 255) - (int)((want >> 8) & 255)) > tol
|| std::abs((int)((got >> 16) & 255) - (int)((want >> 16) & 255)) > tol;
if (bad) { ++fails; std::printf("[marker self-test] FAIL %s: got 0x%08X, want 0x%08X (+/-%d)\n", name, got, want, tol); }
};
// 1. SVG defaults + context state / save-restore
{
Marker* m = mk_marker();
expect((uint32_t)m->marker_width(), 3, 0, "default markerWidth 3");
expect((uint32_t)m->marker_height(), 3, 0, "default markerHeight 3");
expect((uint32_t)m->units(), (uint32_t)Marker::Units::StrokeWidth, 0, "default markerUnits strokeWidth");
expect((uint32_t)m->orient(), (uint32_t)Marker::Orient::Angle, 0, "default orient is angle 0");
expect((uint32_t)m->overflow_visible(), 0, 0, "default overflow hidden");
Canvas2D c(100, 100); c.clear(0);
expect((uint32_t)(uintptr_t)c.marker_start(), 0, 0, "default marker-start none");
c.set_marker(m);
expect((uint32_t)(uintptr_t)c.marker_mid(), (uint32_t)(uintptr_t)m, 0, "marker shorthand sets all three");
c.save(); c.clear_markers();
expect((uint32_t)(uintptr_t)c.marker_end(), 0, 0, "clear_markers");
c.restore();
expect((uint32_t)(uintptr_t)c.marker_start(), (uint32_t)(uintptr_t)m, 0, "restore pops markers");
}
// 2. start / mid / end vertex placement
{
Marker* ms = mkr_make(mkr_sq(), RED, 10, 10, 5, 5);
Marker* mm = mkr_make(mkr_sq(), GREEN, 10, 10, 5, 5);
Marker* me = mkr_make(mkr_sq(), BLUE, 10, 10, 5, 5);
Canvas2D c(100, 100); c.clear(0);
Shape2D p; p.mt(10,50).lt(50,50).lt(90,50).set_line_width(2);
c.fill_style(tr).stroke_style(tr).set_markers(ms, mm, me).path(p);
expect(px(c,10,50), RED, 0, "marker-start on first vertex");
expect(px(c,50,50), GREEN, 0, "marker-mid on interior vertex");
expect(px(c,90,50), BLUE, 0, "marker-end on last vertex");
expect(px(c,30,50), 0, 0, "no marker between vertices");
Canvas2D d(100, 100); d.clear(0);
Shape2D t; t.mt(20,20).lt(80,20).lt(50,70).close().set_line_width(1);
d.fill_style(tr).stroke_style(tr).set_markers(ms, mm, me).path(t);
expect(px(d,20,20), BLUE, 0, "closed: marker-end over marker-start");
expect(px(d,80,20), GREEN, 0, "closed: mid vertex 1");
expect(px(d,50,70), GREEN, 0, "closed: mid vertex 2");
Canvas2D e(100, 100); e.clear(0);
Shape2D u; u.mt(10,20).lt(30,20).mt(50,20).lt(70,20).set_line_width(1);
e.fill_style(tr).stroke_style(tr).set_markers(ms, mm, me).path(u);
expect(px(e,10,20), RED, 0, "two subpaths: start");
expect(px(e,30,20), GREEN, 0, "two subpaths: inner end is mid");
expect(px(e,50,20), GREEN, 0, "two subpaths: inner start is mid");
expect(px(e,70,20), BLUE, 0, "two subpaths: end");
}
// 3. orient: auto / auto-start-reverse / fixed angle / mid bisector
{
Marker* a = mkr_make(mkr_tri(), RED, 10, 10, 10, 5);
Canvas2D c(100, 100); c.clear(0);
Shape2D ln; ln.mt(20,50).lt(80,50).set_line_width(2);
c.fill_style(tr).stroke_style(tr).set_marker_end(a).path(ln);
expect(px(c,76,50), RED, 0, "orient auto: end follows path direction");
expect(px(c,82,50), 0, 0, "orient auto: tip sits on the vertex");
c.clear_markers().set_marker_start(a).clear(0).path(ln);
expect(px(c,12,50), RED, 0, "orient auto: start follows path direction");
expect(px(c,28,50), 0, 0, "orient auto: start is not reversed");
a->set_orient_auto_start_reverse();
c.clear(0).path(ln);
expect(px(c,28,50), RED, 0, "auto-start-reverse flips the start marker");
expect(px(c,12,50), 0, 0, "auto-start-reverse: nothing ahead");
a->set_orient(90.0f);
c.clear_markers().set_marker_end(a).clear(0).path(ln);
expect(px(c,80,42), RED, 0, "fixed orient 90deg");
expect(px(c,88,50), 0, 0, "fixed orient ignores the path direction");
Marker* mid = mkr_make(mkr_tri(), RED, 10, 10, 10, 5);
Canvas2D b(100, 100); b.clear(0);
Shape2D elbow; elbow.mt(10,20).lt(50,20).lt(50,60).set_line_width(2);
b.fill_style(tr).stroke_style(tr).set_marker_mid(mid).path(elbow);
expect(px(b,46,16), RED, 0, "mid vertex uses the tangent bisector");
expect(px(b,54,24), 0, 0, "mid vertex is not the outgoing direction");
}
// 4. refX / refY
{
Marker* m = mkr_make(mkr_sq(), RED, 10, 10, 5, 5);
Canvas2D c(100, 100); c.clear(0);
Shape2D p; p.mt(50,50).lt(90,50).set_line_width(1);
c.fill_style(tr).stroke_style(tr).set_marker_start(m).path(p);
expect(px(c,46,46), RED, 0, "refX/refY centre the marker on the vertex");
expect(px(c,54,54), RED, 0, "ref centre: opposite corner");
expect(px(c,44,50), 0, 0, "ref centre: outside");
m->set_ref(0, 0);
c.clear(0).path(p);
expect(px(c,55,55), RED, 0, "ref 0,0 puts content down-right of the vertex");
expect(px(c,45,45), 0, 0, "ref 0,0: nothing up-left");
}
// 5. markerUnits
{
Marker* m = mk_marker();
m->set_size(10,10).set_ref(5,5).add(mkr_sq(), Paint(RED));    // strokeWidth (default)
Canvas2D c(100, 100); c.clear(0);
Shape2D p; p.mt(50,50).lt(95,50).set_line_width(2);
c.fill_style(tr).stroke_style(tr).set_marker_start(m).path(p);
expect(px(c,59,50), RED, 0, "strokeWidth units scale with line width x2");
p.set_line_width(1); c.clear(0).path(p);
expect(px(c,54,50), RED, 0, "strokeWidth units x1");
expect(px(c,59,50), 0, 0, "strokeWidth units x1 is smaller");
m->set_units(USER); p.set_line_width(4); c.clear(0).path(p);
expect(px(c,54,50), RED, 0, "userSpaceOnUse ignores the stroke width");
expect(px(c,59,50), 0, 0, "userSpaceOnUse stays constant");
m->set_units(Marker::Units::StrokeWidth); p.set_line_width(0); c.clear(0).path(p);
expect(px(c,50,50), 0, 0, "zero stroke width hides strokeWidth markers");
}
// 6. markerWidth / markerHeight viewport clip + overflow
{
Marker* m = mkr_make(mkr_sq20(), RED, 10, 10, 0, 0);
Canvas2D c(100, 100); c.clear(0);
Shape2D p; p.mt(30,30).lt(90,30).set_line_width(1);
c.fill_style(tr).stroke_style(tr).set_marker_start(m).path(p);
expect(px(c,35,35), RED, 0, "content inside the marker viewport");
expect(px(c,45,45), 0, 0, "content clipped to markerWidth/markerHeight");
m->set_overflow_visible(); c.clear(0).path(p);
expect(px(c,45,45), RED, 0, "overflow visible disables the viewport clip");
m->set_overflow_visible(false).set_size(0, 10); c.clear(0).path(p);
expect(px(c,35,35), 0, 0, "zero markerWidth renders nothing");
}
// 7. viewBox + preserveAspectRatio
{
Marker* m = mkr_make(mkr_sq(), RED, 20, 20, 5, 5);
m->set_view_box(0, 0, 10, 10);
Canvas2D c(100, 100); c.clear(0);
Shape2D p; p.mt(50,50).lt(95,50).set_line_width(1);
c.fill_style(tr).stroke_style(tr).set_marker_start(m).path(p);
expect(px(c,59,50), RED, 0, "viewBox scales content into the viewport");
expect(px(c,61,50), 0, 0, "viewBox scale bounds");
m->set_size(20, 10); c.clear(0).path(p);                     // xMidYMid meet
expect(px(c,55,50), RED, 0, "xMidYMid meet centres the viewBox");
expect(px(c,45,50), 0, 0, "letterbox area stays empty");
m->set_preserve_aspect_ratio(Marker::Align::xMinYMin); c.clear(0).path(p);
expect(px(c,45,50), RED, 0, "xMinYMin aligns to the viewport origin");
}
// 8. curve and arc tangents (markers only at command endpoints)
{
Marker* a = mkr_make(mkr_tri(), RED, 10, 10, 10, 5);
Canvas2D c(100, 100); c.clear(0);
Shape2D cv; cv.mt(20,20).ct(40,20,60,50,80,50).set_line_width(1);
c.fill_style(tr).stroke_style(tr).set_marker_end(a).path(cv);
expect(px(c,76,50), RED, 0, "cubic end tangent is horizontal");
expect(px(c,78,44), 0, 0, "cubic end tangent is not the chord");
expect(px(c,50,32), 0, 0, "no markers on flattened curve points");
Canvas2D d(100, 100); d.clear(0);
Shape2D ar; ar.at(50,50,30,0.0f,1.5707963f,false).set_line_width(1);
d.fill_style(tr).stroke_style(tr).set_marker_end(a).path(ar);
expect(px(d,56,80), RED, 0, "arc end tangent points left");
expect(px(d,44,80), 0, 0, "arc end marker does not point right");
}
// 9. markers paint on top of the stroke
{
Marker* m = mkr_make(mkr_sq(), RED, 10, 10, 5, 5);
Canvas2D c(100, 100); c.clear(0);
Shape2D ln; ln.mt(20,50).lt(80,50).set_line_width(8);
c.fill_style(tr).stroke_style(white).set_marker_end(m).path(ln);
expect(px(c,80,50), RED, 0, "marker paints over the stroke");
expect(px(c,40,50), white, 0, "stroke untouched away from the marker");
}
// 10. context-fill / context-stroke
{
Marker* cf = mk_marker();
cf->set_units(USER).set_size(10,10).set_ref(5,5).add_context(mkr_sq(), Marker::Context::Fill);
Canvas2D c(100, 100); c.clear(0);
Shape2D p; p.mt(50,50).lt(95,50).set_line_width(2);
c.fill_style(BLUE).stroke_style(tr).set_marker_start(cf).path(p);
expect(px(c,50,50), BLUE, 0, "context-fill uses the path fill paint");
Marker* cs = mk_marker();
cs->set_units(USER).set_size(12,12).set_ref(5,5).add_context(mkr_ring(), Marker::Context::None, Marker::Context::Stroke);
c.clear_markers().set_marker_start(cs).fill_style(tr).stroke_style(GREEN).clear(0).path(p);
expect(px(c,50,45), GREEN, 0, "context-stroke uses the path stroke paint");
expect(px(c,50,47), 0, 0, "stroked marker content stays hollow");
}
// 11. markers under the CTM
{
Marker* m = mkr_make(mkr_sq(), RED, 10, 10, 5, 5);
Canvas2D c(100, 100); c.clear(0);
c.translate(20, 10); c.scale(2, 2);
Shape2D p; p.mt(10,20).lt(30,20).set_line_width(1);
c.fill_style(tr).stroke_style(tr).set_marker_end(m).path(p);
expect(px(c,89,50), RED, 0, "markers follow translate + scale");
expect(px(c,95,50), 0, 0, "scaled marker bounds");
Marker* a = mkr_make(mkr_tri(), RED, 10, 10, 10, 5);
Canvas2D r(100, 100); r.clear(0);
r.translate(50, 50); r.rotate(1.5707963f);
Shape2D q; q.mt(0,0).lt(20,0).set_line_width(1);
r.fill_style(tr).stroke_style(tr).set_marker_end(a).path(q);
expect(px(r,50,62), RED, 0, "auto orient composes with the CTM rotation");
}
// 12. markers under clip-path and mask
{
Marker* ms = mkr_make(mkr_sq(), RED, 10, 10, 5, 5);
Marker* me = mkr_make(mkr_sq(), BLUE, 10, 10, 5, 5);
Canvas2D c(100, 100); c.clear(0);
Shape2D win = mkr_box(0, 0, 50, 100);                  // named: outlives the draw
ClipPath* cp = mk_clip(); cp->add(win);
Shape2D p; p.mt(20,50).lt(80,50).set_line_width(1);
c.fill_style(tr).stroke_style(tr).set_clip(cp).set_markers(ms, nullptr, me).path(p);
expect(px(c,20,50), RED, 0, "marker inside the clip survives");
expect(px(c,80,50), 0, 0, "marker outside the clip is removed");
c.clear_clip().clear(0);
Shape2D full = mkr_box(0, 0, 100, 100);                // named: outlives the draw
Mask* mk = mk_mask();
mk->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,100,100)
.add_shape(full, Paint(rgba(255,255,255,128)));
c.set_mask(mk).path(p);
expect(px(c,20,50), rgba(255,0,0,128), 1, "marker respects the alpha mask");
c.clear_mask();
}
// 13. dashes do not change marker vertices
{
Marker* mm = mkr_make(mkr_sq(), GREEN, 10, 10, 5, 5);
Canvas2D c(100, 100); c.clear(0);
Shape2D p; p.mt(10,50).lt(50,50).lt(90,50).set_line_width(3).set_dash_array({6,6});
c.fill_style(tr).stroke_style(white).set_marker_mid(mm).path(p);
expect(px(c,50,50), GREEN, 0, "dashed path keeps every vertex marker");
}
// 14. regression: no markers -> plain fill unchanged
{
Canvas2D c(50, 50); c.clear(0);
Shape2D b = mkr_box(10, 10, 30, 30);
c.fill_style(rgba(10,20,30,255)).stroke_style(tr).path(b);
expect(px(c,25,25), rgba(10,20,30,255), 0, "fill without markers unchanged");
expect(px(c,5,5), 0, 0, "outside unchanged");
}
g_markers_selftest_checks = checks;
marker_pool_reset(); mask_pool_reset(); clip_pool_reset();
std::printf("[marker self-test] %u/%u checks passed\n", checks - fails, checks);
return fails;
}
ag_export(get_markers_selftest_checks) uint32_t get_markers_selftest_checks() { return g_markers_selftest_checks; }
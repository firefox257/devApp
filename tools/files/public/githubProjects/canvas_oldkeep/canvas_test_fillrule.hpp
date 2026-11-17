// ./canvas_test_fillrule.hpp
// Test 18: SVG 2 fill-rule (nonzero / evenodd) demo + numeric self-tests.
// INCLUDED by canvas_test.cpp (single translation unit) - not standalone.
// Must be included AFTER canvas_test_svg.hpp: reuses mask_box/clip_pentagram,
// the mk_mask/mk_clip/mk_lin heap pools and mask_pool_reset/clip_pool_reset.
//
// Coverage:
//   demo 1 : same-direction subpaths (nonzero solid / evenodd ring), opposite
//            direction (hole under BOTH rules)
//   demo 2 : self-intersecting pentagram + bowtie
//   demo 3 : Shape2D::set_fill_rule override beats the context rule,
//            clear_fill_rule() restores inheritance
//   demo 4 : gradient fills, drop shadow, fill+stroke (stroke stays nonzero),
//            save/restore of the context rule
//   demo 5 : evenodd fill under clip-path / nonzero fill under mask / text
//   demo 6 : CTM rotate / mirror / rotate+scale (winding survives transforms)
#pragma once
static uint32_t g_fillrule_selftest_checks = 0;
// Two nested squares, SAME winding direction: nonzero -> solid, evenodd -> ring.
static Shape2D fr_same_dir(float x, float y, float outer, float inner) {
Shape2D s = mask_box(x, y, outer, outer);
const float o = (outer - inner) * 0.5f;
s.mt(x + o, y + o).lt(x + o + inner, y + o).lt(x + o + inner, y + o + inner).lt(x + o, y + o + inner).close();
return s;
}
// OPPOSITE winding: hole under BOTH rules (nonzero cancels, evenodd parity 2).
static Shape2D fr_opp_dir(float x, float y, float outer, float inner) {
Shape2D s = mask_box(x, y, outer, outer);
const float o = (outer - inner) * 0.5f;
s.mt(x + o, y + o).lt(x + o, y + o + inner).lt(x + o + inner, y + o + inner).lt(x + o + inner, y + o).close();
return s;
}
static Shape2D fr_bowtie(float x, float y, float w, float h) {
Shape2D s; s.mt(x, y).lt(x + w, y + h).lt(x, y + h).lt(x + w, y).close(); return s;
}
ag_export(run_fillrule_demo)
uint32_t run_fillrule_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 700; height = 980; }
if (g_fillrule_canvas) delete g_fillrule_canvas;
g_fillrule_canvas = new Canvas2D(width, height);
Canvas2D& c = *g_fillrule_canvas;
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
// ---- 1. subpath winding direction ----
section("1. fill-rule & subpath direction", 34);
{
const float y = 48;
checker(CX[0], y, TW, TH); checker(CX[1], y, TW, TH); checker(CX[2], y, TW, TH);
Shape2D a = fr_same_dir(CX[0] + 56, y + 1, 88, 40);
Shape2D b = fr_same_dir(CX[1] + 56, y + 1, 88, 40);
Shape2D d = fr_opp_dir(CX[2] + 56, y + 1, 88, 40);
c.fill_rule(FillRule::NonZero).fill_style(rgba(255,140,60,255)).stroke_style(tr).path(a);
c.fill_rule(FillRule::EvenOdd).fill_style(rgba(90,220,255,255)).path(b);
c.fill_rule(FillRule::NonZero).fill_style(rgba(120,255,170,255)).path(d);
label("nonzero: solid (default)", CX[0], y + TH + 20, 19, dim);
label("evenodd: ring", CX[1], y + TH + 20, 19, dim);
label("opposite dir: hole both", CX[2], y + TH + 20, 19, dim);
}
// ---- 2. self-intersections ----
section("2. self-intersecting paths", 190);
{
const float y = 204;
checker(CX[0], y, TW, TH); checker(CX[1], y, TW, TH); checker(CX[2], y, TW, TH);
Shape2D p1 = clip_pentagram(CX[0] + 100, y + 45, 44);
Shape2D p2 = clip_pentagram(CX[1] + 100, y + 45, 44);
Shape2D bt = fr_bowtie(CX[2] + 60, y + 5, 80, 80);
c.fill_rule(FillRule::NonZero).fill_style(rgba(255,140,60,255)).stroke_style(tr).path(p1);
c.fill_rule(FillRule::EvenOdd).fill_style(rgba(90,220,255,255)).path(p2);
c.fill_rule(FillRule::NonZero).fill_style(rgba(190,120,255,255)).path(bt);
label("nonzero: centre filled", CX[0], y + TH + 20, 19, dim);
label("evenodd: centre hollow", CX[1], y + TH + 20, 19, dim);
label("bowtie: same both", CX[2], y + TH + 20, 19, dim);
c.fill_rule(FillRule::NonZero);
}
// ---- 3. per-shape override vs context rule ----
section("3. Shape2D override beats context rule", 346);
{
const float y = 360;
checker(CX[0], y, TW, TH); checker(CX[1], y, TW, TH); checker(CX[2], y, TW, TH);
Shape2D a = fr_same_dir(CX[0] + 56, y + 1, 88, 40);
Shape2D b = fr_same_dir(CX[1] + 56, y + 1, 88, 40); b.set_fill_rule(FillRule::NonZero);
Shape2D d = fr_same_dir(CX[2] + 56, y + 1, 88, 40); d.set_fill_rule(FillRule::NonZero); d.clear_fill_rule();
c.save();
c.fill_rule(FillRule::EvenOdd).stroke_style(tr);
c.fill_style(rgba(255,140,60,255)).path(a);
c.fill_style(rgba(90,220,255,255)).path(b);
c.fill_style(rgba(120,255,170,255)).path(d);
c.restore();                                   // pops the EvenOdd context rule
label("inherits evenodd", CX[0], y + TH + 20, 19, dim);
label("set_fill_rule(nonzero)", CX[1], y + TH + 20, 19, dim);
label("clear -> inherit", CX[2], y + TH + 20, 19, dim);
}
// ---- 4. gradients / shadow / stroke / save-restore ----
section("4. gradient, shadow, stroke (stroke stays nonzero)", 502);
{
const float y = 516;
checker(CX[0], y, TW, TH); checker(CX[1], y, TW, TH); checker(CX[2], y, TW, TH);
Shape2D a = fr_same_dir(CX[0] + 56, y + 1, 88, 40);
c.save();
c.fill_rule(FillRule::EvenOdd).fill_style(rainbow(CX[0], y, TW)).stroke_style(tr).path(a);
c.restore();
Shape2D b = clip_pentagram(CX[1] + 100, y + 45, 42); b.set_line_width(3).set_line_join(Shape2D::JOIN_ROUND);
c.drop_shadow(5, 5, 3, rgba(0,0,0,230))
.fill_style(rainbow(CX[1], y, TW)).stroke_style(rgba(255,120,60,255)).path(b);
c.clear_shadow();
Shape2D d = fr_same_dir(CX[2] + 56, y + 1, 88, 40);
d.set_fill_rule(FillRule::EvenOdd).set_line_width(4).set_line_join(Shape2D::JOIN_MITER);
c.fill_style(rainbow(CX[2], y, TW)).stroke_style(white).path(d);
label("gradient ring (save/restore)", CX[0], y + TH + 20, 19, dim);
label("nonzero + shadow + stroke", CX[1], y + TH + 20, 19, dim);
label("evenodd fill + stroke", CX[2], y + TH + 20, 19, dim);
}
// ---- 5. clip-path / mask / text ----
section("5. fill-rule under clip-path / mask / text", 658);
{
const float y = 672;
checker(CX[0], y, TW, TH); checker(CX[1], y, TW, TH); checker(CX[2], y, TW, TH);
Shape2D a = fr_same_dir(CX[0] + 56, y + 1, 88, 40); a.set_fill_rule(FillRule::EvenOdd);
Shape2D half = mask_box(CX[0] + 100, y, 100, TH);            // named: must outlive the draw
ClipPath* cp = mk_clip(); cp->add(half);
c.set_clip(cp).fill_style(rainbow(CX[0], y, TW)).stroke_style(tr).path(a);
c.clear_clip();
label("evenodd ring clipped", CX[0], y + TH + 20, 19, dim);
Shape2D b = clip_pentagram(CX[1] + 100, y + 45, 42);
Shape2D full = mask_box(CX[1], y, TW, TH);                   // named: must outlive the draw
LinearGradient* mg = mk_lin(CX[1], y, CX[1] + TW, y);
mg->add_stop(0, rgba(0,0,0,255)).add_stop(1, white);
Mask* m = mk_mask();
m->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[1], y, TW, TH).add_shape(full, Paint(mg));
c.set_mask(m).fill_style(rainbow(CX[1], y, TW)).stroke_style(tr).path(b);
c.clear_mask();
label("nonzero star masked", CX[1], y + TH + 20, 19, dim);
if (g_font) {
g_font->set_pixel_height(64);
c.font(g_font).fill_style(rgba(255,220,120,255)).stroke_style(tr).fill_text("Bb@", CX[2] + 30, y + 66);
} else {
Shape2D fb = mask_box(CX[2] + 20, y + 25, TW - 40, TH - 50);
c.fill_style(rgba(255,220,120,255)).stroke_style(tr).path(fb);
}
label(g_font ? "text inherits nonzero" : "run Font Test first", CX[2], y + TH + 20, 19, dim);
}
// ---- 6. transforms: rotate / mirror / rotate+scale ----
section("6. fill-rule under CTM (rotate / mirror / scale)", 814);
{
const float y = 828;
checker(CX[0], y, TW, TH); checker(CX[1], y, TW, TH); checker(CX[2], y, TW, TH);
Shape2D sq = fr_same_dir(-44, -44, 88, 40);
c.save();
c.translate(CX[0] + 100, y + 45); c.rotate(0.6f);
c.fill_style(rgba(255,140,60,255)).stroke_style(tr).path(sq);
c.restore();
label("rotate: nonzero solid", CX[0], y + TH + 20, 19, dim);
c.save();
c.translate(CX[1] + 100, y + 45); c.scale(-1.0f, 1.0f);      // mirror flips winding sign
c.fill_style(rgba(90,220,255,255)).stroke_style(tr).path(sq);
c.restore();
label("mirror: still solid", CX[1], y + TH + 20, 19, dim);
Shape2D ring = fr_same_dir(-44, -44, 88, 40); ring.set_fill_rule(FillRule::EvenOdd);
c.save();
c.translate(CX[2] + 100, y + 45); c.rotate(-0.4f); c.scale(1.0f, 0.7f);
c.fill_style(rgba(120,255,170,255)).stroke_style(tr).path(ring);
c.restore();
label("rotate+scale: evenodd ring", CX[2], y + TH + 20, 19, dim);
}
c.restore();
c.fill_rule(FillRule::NonZero).fill_style(tr).stroke_style(tr);
mask_pool_reset();
clip_pool_reset();
return 1;
}
// ============================================================================
// TEST 18b - NUMERIC FILL-RULE SELF-TEST (returns the failure count, 0 = pass)
// ============================================================================
ag_export(run_fillrule_selftest)
uint32_t run_fillrule_selftest() {
mask_pool_reset();
clip_pool_reset();
uint32_t fails = 0, checks = 0;
const uint32_t tr = rgba(0,0,0,0), white = rgba(255,255,255,255);
auto alpha_of = [](uint32_t v) { return (int)(v >> 24); };
auto expect = [&](int got, int want, int tol, const char* name) {
++checks;
if (got < want - tol || got > want + tol) {
++fails;
std::printf("[fill-rule self-test] FAIL %s: got %d, want %d (+/-%d)\n", name, got, want, tol);
}
};
// Shared geometry: outer square (10,10)-(90,90), inner (30,30)-(70,70).
Shape2D same = fr_same_dir(10, 10, 80, 40);
Shape2D opp  = fr_opp_dir(10, 10, 80, 40);
// 1. default context rule is NonZero (SVG default): same-dir centre is solid
{
Canvas2D c(100, 100); c.clear(0);
expect((int)c.fill_rule(), (int)FillRule::NonZero, 0, "default rule is nonzero");
c.fill_style(white).stroke_style(tr).path(same);
expect(alpha_of(c.get_buffer()[50*100+50]), 255, 0, "nonzero same-dir centre solid");
expect(alpha_of(c.get_buffer()[50*100+20]), 255, 0, "nonzero ring");
expect(alpha_of(c.get_buffer()[5*100+5]), 0, 0, "nonzero outside");
}
// 2. context EvenOdd: same-dir centre becomes a hole
{
Canvas2D c(100, 100); c.clear(0);
c.fill_rule(FillRule::EvenOdd);
expect((int)c.fill_rule(), (int)FillRule::EvenOdd, 0, "context rule getter");
c.fill_style(white).stroke_style(tr).path(same);
expect(alpha_of(c.get_buffer()[50*100+50]), 0, 0, "evenodd same-dir hole");
expect(alpha_of(c.get_buffer()[50*100+20]), 255, 0, "evenodd ring");
}
// 3. shape override beats the context rule (both directions)
{
Shape2D s_nz = fr_same_dir(10, 10, 80, 40); s_nz.set_fill_rule(FillRule::NonZero);
Canvas2D e(100, 100); e.clear(0); e.fill_rule(FillRule::EvenOdd);
e.fill_style(white).stroke_style(tr).path(s_nz);
expect(alpha_of(e.get_buffer()[50*100+50]), 255, 0, "override nonzero beats context evenodd");
Shape2D s_eo = fr_same_dir(10, 10, 80, 40); s_eo.set_fill_rule(FillRule::EvenOdd);
Canvas2D n(100, 100); n.clear(0);   // context NonZero
n.fill_style(white).stroke_style(tr).path(s_eo);
expect(alpha_of(n.get_buffer()[50*100+50]), 0, 0, "override evenodd beats context nonzero");
expect(alpha_of(n.get_buffer()[50*100+20]), 255, 0, "override evenodd ring");
// 4. clear_fill_rule() restores context inheritance
s_eo.clear_fill_rule();
n.clear(0).path(s_eo);
expect(alpha_of(n.get_buffer()[50*100+50]), 255, 0, "clear -> inherits nonzero");
s_nz.clear_fill_rule();
e.clear(0).path(s_nz);
expect(alpha_of(e.get_buffer()[50*100+50]), 0, 0, "clear -> inherits evenodd");
}
// 5. opposite-direction inner subpath: hole under BOTH rules
{
Canvas2D n(100, 100); n.clear(0);
n.fill_style(white).stroke_style(tr).path(opp);
expect(alpha_of(n.get_buffer()[50*100+50]), 0, 0, "nonzero opposite-dir hole");
expect(alpha_of(n.get_buffer()[50*100+20]), 255, 0, "nonzero opposite-dir ring");
Canvas2D e(100, 100); e.clear(0); e.fill_rule(FillRule::EvenOdd);
e.fill_style(white).stroke_style(tr).path(opp);
expect(alpha_of(e.get_buffer()[50*100+50]), 0, 0, "evenodd opposite-dir hole");
expect(alpha_of(e.get_buffer()[50*100+20]), 255, 0, "evenodd opposite-dir ring");
}
// 6. self-intersecting pentagram: nonzero fills centre, evenodd holes it
{
Shape2D pg = clip_pentagram(50, 50, 40);
Canvas2D n(100, 100); n.clear(0);
n.fill_style(white).stroke_style(tr).path(pg);
expect(alpha_of(n.get_buffer()[50*100+50]), 255, 0, "nonzero pentagram centre");
Canvas2D e(100, 100); e.clear(0); e.fill_rule(FillRule::EvenOdd);
e.fill_style(white).stroke_style(tr).path(pg);
expect(alpha_of(e.get_buffer()[50*100+50]), 0, 0, "evenodd pentagram centre");
expect(alpha_of(e.get_buffer()[20*100+50]), 255, 0, "evenodd pentagram arm");
}
// 7. save/restore pops the context rule (nested)
{
Canvas2D c(100, 100); c.clear(0);
c.save();
c.fill_rule(FillRule::EvenOdd);
c.save();
c.fill_rule(FillRule::NonZero);
c.restore();
expect((int)c.fill_rule(), (int)FillRule::EvenOdd, 0, "restore pops inner rule");
c.fill_style(white).stroke_style(tr).path(same);
expect(alpha_of(c.get_buffer()[50*100+50]), 0, 0, "evenodd inside save");
c.restore();
expect((int)c.fill_rule(), (int)FillRule::NonZero, 0, "restore pops outer rule");
c.clear(0).path(same);
expect(alpha_of(c.get_buffer()[50*100+50]), 255, 0, "nonzero after restore");
}
// 8. strokes ignore the fill-rule (always nonzero)
{
Canvas2D c(100, 100); c.clear(0); c.fill_rule(FillRule::EvenOdd);
Shape2D st = fr_same_dir(10, 10, 80, 40); st.set_line_width(6);
c.fill_style(tr).stroke_style(white).path(st);
expect(alpha_of(c.get_buffer()[10*100+50]), 255, 0, "stroke outer edge under evenodd");
expect(alpha_of(c.get_buffer()[30*100+50]), 255, 0, "stroke inner edge under evenodd");
expect(alpha_of(c.get_buffer()[50*100+50]), 0, 0, "stroke-only centre empty");
c.fill_style(white).path(st);                    // fill + stroke: hole edge stroked
expect(alpha_of(c.get_buffer()[50*100+50]), 0, 0, "fill+stroke evenodd hole");
expect(alpha_of(c.get_buffer()[30*100+50]), 255, 0, "fill+stroke hole edge stroked");
c.clear(0);
Shape2D ln; ln.mt(10, 50).lt(90, 50).set_line_width(10);
c.fill_style(tr).stroke_style(white).path(ln);
expect(alpha_of(c.get_buffer()[50*100+50]), 255, 0, "open line stroke under evenodd");
}
// 9. draw_shape (Font2D-style direct path) honours override AND context rule
{
Canvas2D c(100, 100); c.clear(0);
Shape2D s1 = fr_same_dir(10, 10, 80, 40); s1.set_fill_rule(FillRule::EvenOdd); s1.compile();
c.draw_shape(s1, Paint(white), Paint(tr));
expect(alpha_of(c.get_buffer()[50*100+50]), 0, 0, "draw_shape override evenodd");
expect(alpha_of(c.get_buffer()[50*100+20]), 255, 0, "draw_shape override ring");
c.clear(0).fill_rule(FillRule::EvenOdd);
Shape2D s2 = fr_same_dir(10, 10, 80, 40); s2.compile();
c.draw_shape(s2, Paint(white), Paint(tr));
expect(alpha_of(c.get_buffer()[50*100+50]), 0, 0, "draw_shape inherits context evenodd");
}
// 10. rule survives the CTM: scale, rotate, mirror
{
Canvas2D c(120, 120); c.clear(0);
c.translate(20, 20); c.scale(0.5f, 0.5f);
Shape2D big = fr_same_dir(0, 0, 160, 80);        // device: outer 20..100, inner 40..80
c.fill_style(white).stroke_style(tr).path(big);
expect(alpha_of(c.get_buffer()[60*120+60]), 255, 0, "scaled nonzero centre");
c.fill_rule(FillRule::EvenOdd).clear(0).path(big);
expect(alpha_of(c.get_buffer()[60*120+60]), 0, 0, "scaled evenodd hole");
expect(alpha_of(c.get_buffer()[60*120+30]), 255, 0, "scaled evenodd ring");
Shape2D ctr = fr_same_dir(-40, -40, 80, 40);
Canvas2D r(100, 100); r.clear(0);
r.translate(50, 50); r.rotate(0.7f);
r.fill_style(white).stroke_style(tr).path(ctr);
expect(alpha_of(r.get_buffer()[50*100+50]), 255, 0, "rotated nonzero centre");
r.fill_rule(FillRule::EvenOdd).clear(0).path(ctr);
expect(alpha_of(r.get_buffer()[50*100+50]), 0, 0, "rotated evenodd hole");
Canvas2D m(100, 100); m.clear(0);
m.translate(50, 50); m.scale(-1.0f, 1.0f);      // mirror flips winding sign only
m.fill_style(white).stroke_style(tr).path(ctr);
expect(alpha_of(m.get_buffer()[50*100+50]), 255, 0, "mirrored nonzero centre");
m.fill_rule(FillRule::EvenOdd).clear(0).path(ctr);
expect(alpha_of(m.get_buffer()[50*100+50]), 0, 0, "mirrored evenodd hole");
}
// 11. drop shadow uses the same fill-rule (blur 0: hole stays empty)
{
Canvas2D c(100, 100); c.clear(0);
c.fill_rule(FillRule::EvenOdd).drop_shadow(0, 0, 0, white)
.fill_style(white).stroke_style(tr).path(same);
expect(alpha_of(c.get_buffer()[50*100+50]), 0, 0, "shadow respects evenodd hole");
expect(alpha_of(c.get_buffer()[50*100+20]), 255, 0, "shadow ring opaque");
c.clear_shadow();
}
// 12. gradient paint server respects the rule
{
Canvas2D c(100, 100); c.clear(0); c.fill_rule(FillRule::EvenOdd);
LinearGradient* g = mk_lin(0, 0, 100, 0);
g->add_stop(0, white).add_stop(1, white);
c.fill_style(g).stroke_style(tr).path(same);
expect(alpha_of(c.get_buffer()[50*100+50]), 0, 0, "gradient evenodd hole");
expect(alpha_of(c.get_buffer()[50*100+20]), 255, 0, "gradient evenodd ring");
}
// 13. evenodd fill under a clip-path (right half only)
{
Canvas2D c(100, 100); c.clear(0);
Shape2D s = fr_same_dir(10, 10, 80, 40); s.set_fill_rule(FillRule::EvenOdd);
Shape2D right = mask_box(50, 0, 50, 100);       // named: must outlive the draw
ClipPath* cp = mk_clip(); cp->add(right);
c.set_clip(cp).fill_style(white).stroke_style(tr).path(s);
expect(alpha_of(c.get_buffer()[50*100+70]), 255, 0, "clipped evenodd ring right");
expect(alpha_of(c.get_buffer()[50*100+50]), 0, 0, "clipped evenodd hole");
expect(alpha_of(c.get_buffer()[50*100+20]), 0, 0, "clipped left ring hidden");
expect(alpha_of(c.get_buffer()[20*100+70]), 255, 0, "clipped top band right");
c.clear_clip();
}
// 14. nonzero fill under an alpha mask (multiplicative)
{
Canvas2D c(100, 100); c.clear(0);
Shape2D full = mask_box(0, 0, 100, 100);        // named: must outlive the draw
Mask* m = mk_mask();
m->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(0, 0, 100, 100)
.add_shape(full, Paint(rgba(255,255,255,128)));
c.set_mask(m).fill_style(white).stroke_style(tr).path(same);
expect(alpha_of(c.get_buffer()[50*100+50]), 128, 1, "nonzero solid x alpha mask");
c.clear_mask();
}
// 15. regression: simple fill unchanged, exact straight colour
{
Canvas2D c(50, 50); c.clear(0);
Shape2D b = mask_box(10, 10, 30, 30);
c.fill_style(rgba(10,20,30,255)).stroke_style(tr).path(b);
expect((int)c.get_buffer()[25*50+25], (int)rgba(10,20,30,255), 0, "simple fill unchanged");
expect(alpha_of(c.get_buffer()[5*50+5]), 0, 0, "simple fill outside unchanged");
}
g_fillrule_selftest_checks = checks;
mask_pool_reset();
clip_pool_reset();
std::printf("[fill-rule self-test] %u/%u checks passed\n", checks - fails, checks);
return fails;
}
ag_export(get_fillrule_selftest_checks) uint32_t get_fillrule_selftest_checks() { return g_fillrule_selftest_checks; }
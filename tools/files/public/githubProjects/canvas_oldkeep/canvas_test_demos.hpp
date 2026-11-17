// ./canvas_test_demos.hpp
// Tests 1-15: basic rendering demos for the Canvas2D test exporter,
// plus the Test 8b image-rendering self-test (SVG 2 §9.2:
// preserveAspectRatio alignments, meet/slice/none, imageSmoothing) and the
// Test 9b cap/join self-test (SVG 2 §2.1 stroke-linecap / stroke-linejoin,
// including the new 'miter-clip' join).
// INCLUDED by canvas_test.cpp (single translation unit) - not standalone.
// Relies on the entry file for includes, shared globals (g_*_canvas, g_font,
// g_prefetched_*) and the prefetch exports.
//
// UPDATED for SVG 2 §10: the font demo (Test 8) now also exercises
// text-anchor, dominant-baseline, letter/word-spacing, font-weight,
// font-style and textLength/lengthAdjust; the shadow + dash demos use the
// new typography state on their text runs.
//
// UPDATED for SVG 2 §2.1: the cap/join demo (Test 9) is now 700x1120 and adds
// miter-clip rows (miter vs bevel-fallback vs miter-clip vs round, a
// stroke-miterlimit sweep, and closed / dashed / CTM+gradient samples).
#pragma once
ag_export(run_house_demo)
uint32_t run_house_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 500; height = 500; }
if (g_house_canvas) delete g_house_canvas;
g_house_canvas = new Canvas2D(width, height);
uint32_t sky_blue = rgba(135, 206, 235, 255), grass_green = rgba(34, 139, 34, 255);
uint32_t sun_yellow = rgba(255, 215, 0, 255), house_red = rgba(178, 34, 34, 255);
uint32_t wood_brown = rgba(139, 69, 19, 255), black = rgba(0, 0, 0, 255);
uint32_t white = rgba(255, 255, 255, 255), purple = rgba(128, 0, 128, 255);
uint32_t transparent = rgba(0, 0, 0, 0);
float s = width / 500.0f;
Shape2D grass; grass.mt(0, 350*s).h(width).v(500*s).h(0).close();
Shape2D sun; sun.mt(440*s, 80*s).et(40*s, 40*s, 0, false, true, 360*s, 80*s).et(40*s, 40*s, 0, false, true, 440*s, 80*s).close().set_line_width(1.0f);
Shape2D r1; r1.mt(400*s, 20*s).v(10*s).set_line_width(1.0f);
Shape2D r2; r2.mt(400*s, 140*s).v(150*s).set_line_width(1.0f);
Shape2D r3; r3.mt(340*s, 80*s).h(330*s).set_line_width(1.0f);
Shape2D r4; r4.mt(460*s, 80*s).h(470*s).set_line_width(1.0f);
Shape2D house; house.mt(100*s, 250*s).h(250*s).v(350*s).h(100*s).close();
Shape2D roof; roof.set_line_width(1.0).mt(175*s, 150*s).lt(80*s, 250*s).lt(270*s, 250*s).close();
Shape2D door; door.set_line_width(1.0).mt(110*s, 280*s).h(150*s).v(350*s).h(110*s).close();
Shape2D window; window.mt(190*s, 280*s).h(230*s).v(320*s).h(190*s).close();
Shape2D wc1; wc1.mt(210*s, 280*s).v(320*s).set_line_width(1.0f);
Shape2D wc2; wc2.mt(190*s, 300*s).h(230*s).set_line_width(1.0f);
Shape2D trunk; trunk.mt(350*s, 300*s).h(380*s).v(350*s).h(350*s).close();
Shape2D l1; l1.mt(405*s, 260*s).at(365*s, 260*s, 40*s, 0, 6.2831853f, false).close().set_line_width(1.0f);
Shape2D l2; l2.mt(370*s, 280*s).at(340*s, 280*s, 30*s, 0, 6.2831853f, false).close().set_line_width(1.0f);
Shape2D l3; l3.mt(420*s, 280*s).at(390*s, 280*s, 30*s, 0, 6.2831853f, false).close().set_line_width(1.0f);
Shape2D pth; pth.mt(0, 450*s).ct(100*s, 400*s, 200*s, 500*s, 300*s, 450*s).st(400*s, 500*s, 500*s, 450*s).set_line_width(1.0f);
g_house_canvas->clear(sky_blue)
.fill_style(grass_green).stroke_style(transparent).path(grass)
.fill_style(sun_yellow).path(sun)
.fill_style(transparent).stroke_style(black).path(sun)
.path(r1).path(r2).path(r3).path(r4)
.fill_style(house_red).stroke_style(transparent).path(house)
.fill_style(transparent).stroke_style(black).path(house)
.stroke_style(black).path(roof)
.fill_style(wood_brown).stroke_style(transparent).path(door)
.fill_style(transparent).stroke_style(black).path(door)
.fill_style(white).stroke_style(transparent).path(window)
.fill_style(transparent).stroke_style(black).path(window)
.path(wc1).path(wc2)
.fill_style(wood_brown).stroke_style(transparent).path(trunk)
.fill_style(transparent).stroke_style(black).path(trunk)
.fill_style(grass_green).stroke_style(transparent).path(l1)
.fill_style(transparent).stroke_style(black).path(l1)
.fill_style(grass_green).stroke_style(transparent).path(l2)
.fill_style(transparent).stroke_style(black).path(l2)
.fill_style(grass_green).stroke_style(transparent).path(l3)
.fill_style(transparent).stroke_style(black).path(l3)
.fill_style(transparent).stroke_style(purple).path(pth);
return 1;
}
ag_export(run_lines_demo)
uint32_t run_lines_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 600; height = 600; }
if (g_lines_canvas) delete g_lines_canvas;
g_lines_canvas = new Canvas2D(width, height);
uint32_t bg = rgba(30, 30, 35, 255), grid = rgba(50, 50, 60, 255), tr = rgba(0,0,0,0);
float s = width / 600.0f;
g_lines_canvas->clear(bg).stroke_style(grid);
for (int x = 0; x <= width; x += 50) { Shape2D p; p.mt(x, 0).lt(x, height).set_line_width(1.0f); g_lines_canvas->path(p); }
for (int y = 0; y <= height; y += 50) { Shape2D p; p.mt(0, y).lt(width, y).set_line_width(1.0f); g_lines_canvas->path(p); }
float widths[] = {24.0f, 16.0f, 10.0f, 6.0f, 3.0f, 1.5f, 0.8f, 0.5f};
uint32_t cols[] = {rgba(255,80,80,255), rgba(255,160,50,255), rgba(255,220,50,255), rgba(80,220,80,255), rgba(50,150,255,255), rgba(180,80,255,255), rgba(255,105,180,255), rgba(0,255,255,255)};
for (int i = 7; i >= 0; --i) {
float w = widths[i], off = (7 - i) * 40.0f * s;
float bx = width * 0.35f, acx = 460.0f * s + off * 0.2f, acy = 120.0f * s + off, ar = 25.0f * s;
Shape2D l1; l1.mt(40.0f*s+off, 40.0f*s).lt(width*0.25f+off, height*0.45f).set_line_width(w);
Shape2D q1; q1.mt(40.0f*s+off, height*0.55f+120.0f*s).qt(130.0f*s+off, height*0.55f-80.0f*s, 220.0f*s+off, height*0.55f+120.0f*s).set_line_width(w);
Shape2D c1; c1.mt(bx+off, height*0.55f+100.0f*s).ct(bx+40.0f*s+off, height*0.55f-80.0f*s, bx+80.0f*s+off, height*0.55f+280.0f*s, bx+120.0f*s+off, height*0.55f+100.0f*s).set_line_width(w);
Shape2D a1; a1.mt(acx+ar*std::cos(0.0f), acy+ar*std::sin(0.0f)).at(acx, acy, ar, 0.0f, 4.71238898f, false).set_line_width(w);
Shape2D a2; a2.mt(acx+65.0f*s+ar*0.8f*std::cos(0.0f), acy+ar*0.8f*std::sin(0.0f)).at(acx+65.0f*s, acy, ar*0.8f, 0.0f, 4.71238898f, false).close();
g_lines_canvas->stroke_style(cols[i]).fill_style(tr).path(l1).path(q1).path(c1).path(a1);
g_lines_canvas->fill_style(cols[i]).stroke_style(tr).path(a2);
}
return 1;
}
ag_export(run_path_demo)
uint32_t run_path_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 600; height = 600; }
if (g_path_canvas) delete g_path_canvas;
g_path_canvas = new Canvas2D(width, height);
float s = width / 600.0f;
g_path_canvas->clear(rgba(240, 240, 245, 255));
Shape2D heart;
heart.mt(300*s, 150*s).ct(200*s, 50*s, 100*s, 150*s, 100*s, 250*s).ct(100*s, 400*s, 300*s, 500*s, 300*s, 500*s).ct(300*s, 500*s, 500*s, 400*s, 500*s, 250*s).ct(500*s, 150*s, 400*s, 50*s, 300*s, 150*s).close().set_line_width(4.0f);
g_path_canvas->fill_style(rgba(255, 80, 80, 255)).stroke_style(rgba(180, 0, 0, 255)).path(heart);
Shape2D cloud;
cloud.mt(100*s, 300*s).qt(100*s, 250*s, 150*s, 250*s).q(180*s, 200*s, 250*s, 220*s).qt(300*s, 180*s, 350*s, 230*s).q(400*s, 200*s, 420*s, 260*s).qt(480*s, 260*s, 480*s, 310*s).q(480*s, 360*s, 420*s, 360*s).qt(400*s, 400*s, 300*s, 400*s).q(200*s, 400*s, 180*s, 360*s).qt(120*s, 360*s, 100*s, 300*s).close().set_line_width(3.0f);
g_path_canvas->fill_style(rgba(255, 255, 255, 255)).stroke_style(rgba(150, 150, 160, 255)).path(cloud);
Shape2D star;
star.mt(150*s, 100*s).l(180*s, 180*s).lt(260*s, 180*s).l(195*s, 230*s).lt(220*s, 310*s).l(150*s, 260*s).lt(80*s, 310*s).l(105*s, 230*s).lt(40*s, 180*s).l(120*s, 180*s).close().set_line_width(2.0f);
g_path_canvas->fill_style(rgba(255, 215, 0, 255)).stroke_style(rgba(200, 150, 0, 255)).path(star);
Shape2D wave;
wave.mt(50*s, 450*s).c(150*s, 350*s, 250*s, 550*s, 350*s, 450*s).s(550*s, 550*s, 650*s, 450*s).set_line_width(6.0f);
g_path_canvas->fill_style(rgba(0,0,0,0)).stroke_style(rgba(50, 100, 255, 255)).path(wave);
Shape2D rel;
rel.mt(50*s, 500*s).htr(60*s).vtr(40*s).ltr(60*s, 0).qtr(40*s, -40*s, 80*s, 0).ttr(80*s, 0)
.ctr(30*s, -40*s, 60*s, 40*s, 90*s, 0).str(60*s, -40*s, 90*s, 0)
.etr(40*s, 25*s, 0, false, true, 60*s, -40*s).close().set_line_width(2.0f);
g_path_canvas->fill_style(rgba(255, 100, 100, 255)).stroke_style(rgba(0, 0, 0, 255)).path(rel);
Shape2D twave;
twave.mt(20*s, 60*s).qt(45*s, 20*s, 70*s, 60*s).tt(120*s, 60*s).t(170*s, 60*s).set_line_width(4.0f);
g_path_canvas->fill_style(rgba(0,0,0,0)).stroke_style(rgba(0, 150, 130, 255)).path(twave);
Shape2D steps;
steps.mt(500*s, 40*s).h(530*s).v(65*s).h(555*s).v(90*s).h(580*s).v(115*s).set_line_width(4.0f);
g_path_canvas->stroke_style(rgba(230, 120, 40, 255)).path(steps);
Shape2D leaf;
leaf.mt(515*s, 330*s).et(70*s, 26*s, -35.0f, false, true, 585*s, 185*s)
.et(70*s, 26*s, -35.0f, false, true, 515*s, 330*s).close().set_line_width(2.0f);
g_path_canvas->fill_style(rgba(90, 200, 90, 255)).stroke_style(rgba(30, 110, 40, 255)).path(leaf);
Shape2D arcBig;
arcBig.mt(508*s, 165*s).et(40*s, 22*s, 0, true, true, 578*s, 165*s).set_line_width(4.0f);
g_path_canvas->fill_style(rgba(0,0,0,0)).stroke_style(rgba(150, 60, 200, 255)).path(arcBig);
Shape2D arcSmall;
arcSmall.mt(508*s, 165*s).et(40*s, 22*s, 0, false, true, 578*s, 165*s).set_line_width(2.0f);
g_path_canvas->stroke_style(rgba(120, 120, 130, 255)).path(arcSmall);
Shape2D degen;
degen.mt(505*s, 230*s).et(0, 22*s, 0, true, true, 585*s, 230*s)
.et(22*s, 0, 0, false, false, 585*s, 255*s)
.et(22*s, 22*s, 0, false, true, 585*s, 255*s)
.etr(0, 0, 0, false, true, -80*s, 0).close().set_line_width(3.0f);
g_path_canvas->stroke_style(rgba(90, 90, 100, 255)).path(degen);
return 1;
}
ag_export(run_alpha_demo)
uint32_t run_alpha_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 400; height = 400; }
if (g_alpha_canvas) delete g_alpha_canvas;
g_alpha_canvas = new Canvas2D(width, height);
uint32_t c1 = rgba(220, 220, 220, 255), c2 = rgba(180, 180, 180, 255), tr = rgba(0,0,0,0);
int cs = 20;
for (int y = 0; y < height; y += cs) {
for (int x = 0; x < width; x += cs) {
Shape2D p; p.mt(x,y).lt(x+cs,y).lt(x+cs,y+cs).lt(x,y+cs).close();
g_alpha_canvas->fill_style(((x/cs)+(y/cs))%2==0 ? c1 : c2).stroke_style(tr).path(p);
}
}
Shape2D r1; r1.mt(20,20).lt(100,20).lt(100,100).lt(20,100).close(); g_alpha_canvas->fill_style(rgba(255,0,0,140)).stroke_style(tr).path(r1);
Shape2D r2; r2.mt(60,60).lt(140,60).lt(140,140).lt(60,140).close(); g_alpha_canvas->fill_style(rgba(0,255,0,140)).stroke_style(tr).path(r2);
Shape2D r3; r3.mt(40,40).lt(120,40).lt(120,120).lt(40,120).close(); g_alpha_canvas->fill_style(rgba(0,0,255,140)).stroke_style(tr).path(r3);
Shape2D ci1; ci1.mt(320,50).at(280,50,40,0,6.2831853f,false).close(); g_alpha_canvas->fill_style(rgba(255,255,0,160)).stroke_style(tr).path(ci1);
Shape2D ci2; ci2.mt(380,110).at(340,110,40,0,6.2831853f,false).close(); g_alpha_canvas->fill_style(rgba(128,0,128,160)).stroke_style(tr).path(ci2);
Shape2D heart; float hx=10, hy=150, sc=0.45f;
heart.mt(hx+150*sc, hy+50*sc).ct(hx+100*sc, hy, hx+50*sc, hy+50*sc, hx+50*sc, hy+100*sc).ct(hx+50*sc, hy+200*sc, hx+150*sc, hy+250*sc, hx+150*sc, hy+250*sc).ct(hx+150*sc, hy+250*sc, hx+250*sc, hy+200*sc, hx+250*sc, hy+100*sc).ct(hx+250*sc, hy+50*sc, hx+200*sc, hy, hx+150*sc, hy+50*sc).close().set_line_width(4.0f);
g_alpha_canvas->fill_style(rgba(0,255,255,120)).stroke_style(rgba(0,200,200,220)).path(heart);
Shape2D ab; ab.mt(240,170).ltr(100,0).ltr(0,100).ltr(-100,0).close().set_line_width(10.0f);
g_alpha_canvas->fill_style(rgba(255,165,0,80)).stroke_style(rgba(255,69,0,200)).path(ab);
Shape2D wa; wa.mt(10,330).c(80,290,150,370,220,330).ct(290,290,360,370,390,330).set_line_width(16.0f);
g_alpha_canvas->fill_style(tr).stroke_style(rgba(255,255,255,100)).path(wa);
Shape2D l1; l1.mt(240,310).lt(380,390).set_line_width(18.0f); g_alpha_canvas->stroke_style(rgba(255,100,100,120)).path(l1);
Shape2D l2; l2.mt(240,390).lt(380,310).set_line_width(18.0f); g_alpha_canvas->stroke_style(rgba(100,255,100,120)).path(l2);
return 1;
}
ag_export(run_hole_demo)
uint32_t run_hole_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 600; height = 600; }
if (g_hole_canvas) delete g_hole_canvas;
g_hole_canvas = new Canvas2D(width, height);
g_hole_canvas->fill_rule(FillRule::EvenOdd);
uint32_t c1 = rgba(200,200,200,255), c2 = rgba(220,220,220,255);
for (int y = 0; y < height; y += 20) {
for (int x = 0; x < width; x += 20) {
Shape2D p; p.mt(x,y).lt(x+20,y).lt(x+20,y+20).lt(x,y+20).close();
g_hole_canvas->fill_style(((x/20)+(y/20))%2==0 ? c1 : c2).stroke_style(rgba(0,0,0,0)).path(p);
}
}
float s = width / 600.0f;
Shape2D sq; sq.mt(50*s,50*s).lt(250*s,50*s).lt(250*s,250*s).lt(50*s,250*s).close().mt(100*s,100*s).lt(100*s,200*s).lt(200*s,200*s).lt(200*s,100*s).close().set_line_width(3.0f);
g_hole_canvas->fill_style(rgba(100,149,237,255)).stroke_style(rgba(25,25,112,255)).path(sq);
Shape2D donut; float dcx=450*s, dcy=150*s, outer_r=120*s, inner_r=60*s;
donut.mt(dcx+outer_r,dcy).at(dcx,dcy,outer_r,0,6.2831853f,false).close().mt(dcx+inner_r,dcy).at(dcx,dcy,inner_r,0,6.2831853f,true).close().set_line_width(3.0f);
g_hole_canvas->fill_style(rgba(50,205,50,255)).stroke_style(rgba(0,100,0,255)).path(donut);
Shape2D star; float scx=150*s, scy=450*s, sor=100*s, sir=40*s;
for(int i=0;i<5;++i){
float oa=(i*72-90)*3.14159265f/180.0f, ia=((i*72)+36-90)*3.14159265f/180.0f;
if(i==0) star.mt(scx+sor*std::cos(oa), scy+sor*std::sin(oa));
else star.lt(scx+sor*std::cos(oa), scy+sor*std::sin(oa));
star.lt(scx+sir*std::cos(ia), scy+sir*std::sin(ia));
}
star.close().mt(scx+30*s, scy).at(scx, scy, 30*s, 0, 6.2831853f, true).close().set_line_width(3.0f);
g_hole_canvas->fill_style(rgba(255,165,0,255)).stroke_style(rgba(139,69,19,255)).path(star);
Shape2D lo; float ocx=450*s, ocy=450*s;
lo.mt(ocx-80*s, ocy+100*s).ct(ocx-80*s, ocy-100*s, ocx+80*s, ocy-100*s, ocx+80*s, ocy+100*s).lt(ocx+40*s, ocy+100*s).ct(ocx+40*s, ocy-60*s, ocx-40*s, ocy-60*s, ocx-40*s, ocy+100*s).close().set_line_width(3.0f);
g_hole_canvas->fill_style(rgba(138,43,226,255)).stroke_style(rgba(75,0,130,255)).path(lo);
Shape2D mh; float mx=300*s, my=300*s, mw=200*s, mh_h=200*s;
mh.mt(mx-mw/2, my-mh_h/2).lt(mx+mw/2, my-mh_h/2).lt(mx+mw/2, my+mh_h/2).lt(mx-mw/2, my+mh_h/2).close()
.mt(mx, my-mh_h/4).at(mx, my-mh_h/4, 30*s, 0, 6.2831853f, true).close()
.mt(mx-mw/4, my+mh_h/4).at(mx-mw/4, my+mh_h/4, 30*s, 0, 6.2831853f, true).close()
.mt(mx+mw/4, my+mh_h/4).at(mx+mw/4, my+mh_h/4, 30*s, 0, 6.2831853f, true).close().set_line_width(3.0f);
g_hole_canvas->fill_style(rgba(255,105,180,255)).stroke_style(rgba(139,0,139,255)).path(mh);
Shape2D nh; float ncx=450*s, ncy=450*s;
nh.mt(ncx+80*s, ncy).at(ncx, ncy, 80*s, 0, 6.2831853f, false).close()
.mt(ncx-40*s, ncy-40*s).lt(ncx+40*s, ncy-40*s).lt(ncx+40*s, ncy+40*s).lt(ncx-40*s, ncy+40*s).close()
.mt(ncx+15*s, ncy).at(ncx, ncy, 15*s, 0, 6.2831853f, true).close().set_line_width(3.0f);
g_hole_canvas->fill_style(rgba(138,43,226,255)).stroke_style(rgba(75,0,130,255)).path(nh);
return 1;
}
ag_export(run_crossing_demo)
uint32_t run_crossing_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 600; height = 600; }
if (g_crossing_canvas) delete g_crossing_canvas;
g_crossing_canvas = new Canvas2D(width, height);
g_crossing_canvas->fill_rule(FillRule::EvenOdd);
uint32_t c1 = rgba(230,230,230,255), c2 = rgba(250,250,250,255);
for (int y = 0; y < height; y += 20) {
for (int x = 0; x < width; x += 20) {
Shape2D p; p.mt(x,y).lt(x+20,y).lt(x+20,y+20).lt(x,y+20).close();
g_crossing_canvas->fill_style(((x/20)+(y/20))%2==0 ? c1 : c2).stroke_style(rgba(0,0,0,0)).path(p);
}
}
float s = width / 600.0f;
Shape2D bt; bt.mt(50*s,50*s).lt(250*s,250*s).lt(50*s,250*s).lt(250*s,50*s).close().set_line_width(3.0f);
g_crossing_canvas->fill_style(rgba(255,99,71,255)).stroke_style(rgba(139,0,0,255)).path(bt);
Shape2D pg; float pcx=450*s, pcy=150*s, pr=100*s; float ang[]={-90,54,198,342,126};
for(int i=0;i<5;++i){ float rad=ang[i]*3.14159265f/180.0f; if(i==0) pg.mt(pcx+pr*std::cos(rad), pcy+pr*std::sin(rad)); else pg.lt(pcx+pr*std::cos(rad), pcy+pr*std::sin(rad)); }
pg.close().set_line_width(3.0f);
g_crossing_canvas->fill_style(rgba(65,105,225,255)).stroke_style(rgba(0,0,139,255)).path(pg);
Shape2D vn;
vn.mt(150*s,400*s).at(150*s,400*s,80*s,0,6.2831853f,false).close()
.mt(250*s,400*s).at(250*s,400*s,80*s,0,6.2831853f,false).close()
.mt(200*s,486*s).at(200*s,486*s,80*s,0,6.2831853f,false).close().set_line_width(2.0f);
g_crossing_canvas->fill_style(rgba(50,205,50,255)).stroke_style(rgba(0,100,0,255)).path(vn);
Shape2D rb;
rb.mt(400*s,350*s).lt(550*s,350*s).lt(550*s,500*s).lt(400*s,500*s).close()
.mt(450*s,380*s).lt(500*s,470*s).lt(450*s,470*s).lt(500*s,380*s).close().set_line_width(3.0f);
g_crossing_canvas->fill_style(rgba(255,165,0,255)).stroke_style(rgba(139,69,19,255)).path(rb);
return 1;
}
static void draw_checkerboard(Canvas2D* c, int cell, uint32_t a, uint32_t b) {
uint32_t tr = rgba(0,0,0,0); int w=c->get_width(), h=c->get_height();
for (int y=0; y<h; y+=cell) for (int x=0; x<w; x+=cell) {
Shape2D p; p.mt(x,y).lt(x+cell,y).lt(x+cell,y+cell).lt(x,y+cell).close();
c->fill_style(((x/cell)+(y/cell))%2==0 ? a : b).stroke_style(tr).path(p);
}
}
// Updated for SVG 2 §9.2: the manual aspect-fit math is replaced by the new
// preserveAspectRatio overloads, and the smoothing state is exercised
// (High-quality minification vs. nearest-neighbour pixelation).
static void draw_image_demo(Canvas2D* c, const Image& img, uint32_t width, uint32_t height) {
const uint32_t tr = rgba(0,0,0,0), frame = rgba(35,35,45,255);
float iw=img.getWidth(), ih=img.getHeight(); if(iw<=0||ih<=0) return;
float pad=12, lw=width*0.60f, rx=lw+pad*2, rw=width-rx-pad;
auto stroke_frame = [&](float x, float y, float w, float h) {
Shape2D f; f.mt(x,y).lt(x+w,y).lt(x+w,y+h).lt(x,y+h).close().set_line_width(1.0f);
c->fill_style(tr).stroke_style(frame).path(f);
};
// 1. Left: xMidYMid meet - letterboxed, aspect preserved (was manual fit math).
float lh = height - pad*2;
c->draw_image(img, pad, pad, lw - pad*2, lh, ImageAlign::xMidYMid, ImageFit::Meet);
stroke_frame(pad, pad, lw - pad*2, lh);
// 2. Top right: preserveAspectRatio="none" - legacy stretch (back-compat).
float bh=height*0.30f;
c->draw_image(img, rx, pad, rw, bh, ImageAlign::None);
stroke_frame(rx, pad, rw, bh);
// 3. Middle right: smoothing comparison in identical meet boxes
//    (left: High quality, right: imageSmoothingEnabled = false).
float ty=pad+bh+pad, th=height*0.18f, hw=(rw-pad)*0.5f;
c->save();
c->image_smoothing_enabled(true).image_smoothing_quality(ImageSmoothingQuality::High);
c->draw_image(img, rx, ty, hw, th, ImageAlign::xMidYMid, ImageFit::Meet);
c->image_smoothing_enabled(false);
c->draw_image(img, rx + hw + pad, ty, hw, th, ImageAlign::xMidYMid, ImageFit::Meet);
c->restore();
stroke_frame(rx, ty, hw, th); stroke_frame(rx + hw + pad, ty, hw, th);
// 4. Bottom right: xMidYMid slice over magenta - fills the viewport, crops
//    the overflow (any magenta showing through would be a bug).
float ay=ty+th+pad, ah=height*0.22f;
Shape2D f3; f3.mt(rx,ay).lt(rx+rw,ay).lt(rx+rw,ay+ah).lt(rx,ay+ah).close();
c->fill_style(rgba(255,0,128,255)).stroke_style(tr).path(f3);
c->draw_image(img, rx, ay, rw, ah, ImageAlign::xMidYMid, ImageFit::Slice);
stroke_frame(rx, ay, rw, ah);
// 5. Overflow regressions: natural-size draw + negative origin stretch.
c->draw_image(img, width-30, height-30);
c->draw_image(img, -iw*0.25f, height-26, iw*0.5f, 26);
}
// ======================================================================
// TEST 8: FONT / TEXT
// Rows 1-6 are the original glyph-rendering checks (unchanged behaviour).
// Rows 7+ exercise SVG 2 §10.1/§10.2: text-anchor, dominant-baseline,
// letter/word-spacing, font-weight, font-style, textLength/lengthAdjust.
// ======================================================================
static void draw_font_demo(Canvas2D* c, Font* font, uint32_t width, uint32_t height) {
const uint32_t tr=rgba(0,0,0,0), ink=rgba(28,28,36,255), red=rgba(210,40,60,255), blue=rgba(40,90,200,255), bl=rgba(0,170,0,70);
float s=std::min(width/600.0f, height/820.0f), x=20*s, xe=580*s;
c->font(font); font->set_pixel_height(52*s);
const char* head="Canvas2D Text"; Font::StringMetrics m=font->get_string_metrics(head); float hy=58*s;
Shape2D hb; hb.mt(x, hy-m.ascent).lt(x+m.width, hy-m.ascent).lt(x+m.width, hy-m.descent).lt(x, hy-m.descent).close();
c->fill_style(rgba(80,140,255,45)).stroke_style(tr).path(hb);
c->fill_style(ink).stroke_style(tr).fill_text(head, x, hy);
Shape2D bl1; bl1.mt(x,hy).lt(xe,hy).set_line_width(1.0f); c->stroke_style(bl).path(bl1);
float y2=124*s; font->set_pixel_height(52*s);
c->fill_style(tr).stroke_style(red).stroke_text("Outline Only", x, y2);
Shape2D bl2; bl2.mt(x,y2).lt(xe,y2).set_line_width(1.0f); c->stroke_style(bl).path(bl2);
float y3=186*s; font->set_pixel_height(48*s);
c->fill_style(rgba(255,205,60,255)).stroke_style(rgba(120,70,0,255));
c->fill_text("Fill + Stroke", x, y3); c->stroke_text("Fill + Stroke", x, y3);
Shape2D bl3; bl3.mt(x,y3).lt(xe,y3).set_line_width(1.0f); c->stroke_style(bl).path(bl3);
struct Row { float px, y; }; const Row rows[]={{10,226},{14,246},{18,270},{24,300},{32,338}};
for(int i=0;i<5;++i){
float by=rows[i].y*s; char label[24]; std::snprintf(label, sizeof(label), "%dpx", (int)rows[i].px);
font->set_pixel_height(12*s); c->fill_style(rgba(130,130,150,255)).stroke_style(tr).fill_text(label, x, by);
font->set_pixel_height(rows[i].px*s); c->fill_style(ink).stroke_style(tr).fill_text("Quick brown fox 0123", 80*s, by);
Shape2D blr; blr.mt(80*s,by).lt(xe,by).set_line_width(1.0f); c->stroke_style(bl).path(blr);
}
font->set_pixel_height(34*s); c->fill_style(blue).stroke_style(tr).fill_text("oO08@ae%& holes", x, 392*s);
font->set_pixel_height(26*s); c->fill_style(ink).stroke_style(tr).fill_text("UTF-8: Gruesse, cafe, naive, Omega", x, 432*s);
// SVG 2 §10.1: the manual measure+centre maths is now text-anchor: middle.
float bdy=456*s, bdh=44*s, bby=488*s;
Shape2D band; band.mt(0,bdy).lt(width,bdy).lt(width,bdy+bdh).lt(0,bdy+bdh).close();
c->fill_style(blue).stroke_style(tr).path(band);
TextStyle band_st; band_st.font_size=26*s; band_st.anchor=TextAnchor::Middle;
c->fill_style(rgba(255,255,255,170)).stroke_style(tr).fill_text("centered alpha text", width*0.5f, bby, band_st);
font->set_pixel_height(18*s); c->fill_style(rgba(90,90,110,255)).fill_text("AVATAR To To Wafer kerning pairs", x, 536*s);
// ------------------------------------------------------------------
// SVG 2 §10 TYPOGRAPHY (explicit TextStyle overloads keep the demo state
// clean; font_size never mutates the shared Font).
// ------------------------------------------------------------------
TextStyle lab; lab.font_size = 12*s;
c->fill_style(rgba(130,130,150,255)).stroke_style(tr);
c->fill_text("text-anchor", x, 566*s, lab);
c->fill_text("dominant-baseline", 330*s, 566*s, lab);
// text-anchor around a fixed x = 190
Shape2D atick; atick.mt(190*s, 574*s).lt(190*s, 660*s).set_line_width(1.0f);
c->fill_style(tr).stroke_style(rgba(220,60,60,150)).path(atick);
TextStyle ta; ta.font_size = 20*s;
c->fill_style(ink);
ta.anchor = TextAnchor::Start;  c->fill_text("start",  190*s, 596*s, ta);
ta.anchor = TextAnchor::Middle; c->fill_text("middle", 190*s, 624*s, ta);
ta.anchor = TextAnchor::End;    c->fill_text("end",    190*s, 652*s, ta);
// dominant-baseline on a shared rule at y = 620
Shape2D brule; brule.mt(330*s, 620*s).lt(xe, 620*s).set_line_width(1.0f);
c->fill_style(tr).stroke_style(bl).path(brule);
const DominantBaseline dbs[] = {DominantBaseline::Alphabetic, DominantBaseline::Middle, DominantBaseline::Central,
DominantBaseline::Hanging, DominantBaseline::TextTop};
const char* dbl[] = {"alpha", "middle", "central", "hanging", "top"};
TextStyle tb; tb.font_size = 18*s;
for (int i = 0; i < 5; ++i) {
tb.baseline = dbs[i];
c->fill_style(ink).fill_text("Hg", (334 + i*50)*s, 620*s, tb);
lab.font_size = 9*s;
c->fill_style(rgba(130,130,150,255)).fill_text(dbl[i], (334 + i*50)*s, 662*s, lab);
}
// letter-spacing / word-spacing
TextStyle ts; ts.font_size = 18*s;
c->fill_style(ink);
ts.letter_spacing = 0;      c->fill_text("letter spacing 0", x, 692*s, ts);
ts.letter_spacing = 4*s;    c->fill_text("letter spacing 4", x, 716*s, ts);
ts.letter_spacing = 0; ts.word_spacing = 12*s;
c->fill_text("word   spacing   12", x, 740*s, ts);
// font-weight ramp (synthetic emboldening when no bold face is registered)
TextStyle tw; tw.font_size = 20*s;
const int wts[4] = {100, 400, 700, 900};
for (int i = 0; i < 4; ++i) {
char buf[24]; std::snprintf(buf, sizeof(buf), "Ag %d", wts[i]);
tw.font_weight = wts[i];
c->fill_style(ink).fill_text(buf, (20 + i*145)*s, 770*s, tw);
}
// font-style + textLength / lengthAdjust
TextStyle ti; ti.font_size = 20*s; ti.font_style = FontStyle::Italic; ti.font_weight = 700;
c->fill_style(blue).fill_text("Bold Italic", x, 800*s, ti);
TextStyle tl; tl.font_size = 18*s; tl.text_length = 130*s;
tl.length_adjust = LengthAdjust::Spacing;
c->fill_style(ink).fill_text("LENGTH", 240*s, 800*s, tl);
tl.length_adjust = LengthAdjust::SpacingAndGlyphs;
c->fill_style(red).fill_text("LENGTH", 400*s, 800*s, tl);
Shape2D ltick; ltick.mt(370*s, 782*s).lt(370*s, 806*s).mt(530*s, 782*s).lt(530*s, 806*s).set_line_width(1.0f);
c->fill_style(tr).stroke_style(rgba(120,120,140,160)).path(ltick);
}
ag_export(run_image_demo)
uint32_t run_image_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 600; height = 400; }
if (g_image_canvas) delete g_image_canvas;
g_image_canvas = new Canvas2D(width, height);
draw_checkerboard(g_image_canvas, 16, rgba(228,228,228,255), rgba(198,198,198,255));
if (!g_prefetched_image_data || g_prefetched_image_size == 0) return 0;
Image img;
if (img.loadFromMemory(g_prefetched_image_data, (int)g_prefetched_image_size, 0)) {
draw_image_demo(g_image_canvas, img, width, height);
return 1;
}
return 0;
}
ag_export(run_font_demo)
uint32_t run_font_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 600; height = 820; }
if (g_font_canvas) delete g_font_canvas;
g_font_canvas = new Canvas2D(width, height);
g_font_canvas->clear(rgba(248,248,252,255));
if (!g_prefetched_font_data || g_prefetched_font_size == 0) return 0;
if (g_font) { delete g_font; g_font = nullptr; }
g_font = new Font();
float s=std::min(width/600.0f, height/820.0f);
if (g_font->load(g_prefetched_font_data, g_prefetched_font_size, 52*s)) {
draw_font_demo(g_font_canvas, g_font, width, height);
return 1;
}
delete g_font; g_font = nullptr;
return 0;
}
ag_export(run_capjoin_demo)
uint32_t run_capjoin_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 700; height = 1120; }
if (g_capjoin_canvas) delete g_capjoin_canvas;
g_capjoin_canvas = new Canvas2D(width, height);
float s=std::min(width/700.0f, height/1120.0f);
uint32_t bg=rgba(24,28,36,255), tr=rgba(0,0,0,0), guide=rgba(90,90,110,90), gs=rgba(200,200,220,110);
g_capjoin_canvas->clear(bg).stroke_style(guide);
for (int gx=0; gx<=width; gx+=50) { Shape2D p; p.mt(gx,0).lt(gx,height).set_line_width(0.5f); g_capjoin_canvas->path(p); }
for (int gy=0; gy<=height; gy+=50) { Shape2D p; p.mt(0,gy).lt(width,gy).set_line_width(0.5f); g_capjoin_canvas->path(p); }
float cw=22*s; uint32_t crc[]={rgba(255,100,100,255), rgba(100,220,100,255), rgba(100,150,255,255)};
const Shape2D::LineCap caps[]={Shape2D::CAP_BUTT, Shape2D::CAP_ROUND, Shape2D::CAP_SQUARE};
for(int row=0; row<3; ++row){
float y=(70+row*70)*s;
Shape2D g1; g1.mt(60*s,y-26*s).lt(60*s,y+26*s).set_line_width(1.0f); g_capjoin_canvas->stroke_style(gs).path(g1);
Shape2D g2; g2.mt(200*s,y-26*s).lt(200*s,y+26*s).set_line_width(1.0f); g_capjoin_canvas->path(g2);
Shape2D l1; l1.mt(60*s,y).lt(200*s,y).set_line_width(cw).set_line_cap(caps[row]).set_line_join(Shape2D::JOIN_MITER);
Shape2D q1; q1.mt(250*s,y+18*s).qt(320*s,y-42*s, 390*s,y+18*s).set_line_width(cw).set_line_cap(caps[row]).set_line_join(Shape2D::JOIN_MITER);
Shape2D a1; a1.mt(480*s+34*s*std::cos(0.6f), y+34*s*std::sin(0.6f)).at(480*s, y, 34*s, 0.6f, 5.2f, false).set_line_width(cw).set_line_cap(caps[row]).set_line_join(Shape2D::JOIN_MITER);
Shape2D zig; zig.mt(560*s,y+16*s).lt(590*s,y-16*s).lt(620*s,y+16*s).lt(650*s,y-16*s).set_line_width(cw*0.7f).set_line_cap(caps[row]).set_line_join(Shape2D::JOIN_MITER).set_miter_limit(4.0f);
g_capjoin_canvas->stroke_style(crc[row]).fill_style(tr).path(l1).path(q1).path(a1);
g_capjoin_canvas->fill_style(tr).stroke_style(crc[row]).path(zig);
}
uint32_t jc[]={rgba(255,200,50,255), rgba(200,100,255,255), rgba(50,220,220,255)};
const Shape2D::LineJoin joins[]={Shape2D::JOIN_MITER, Shape2D::JOIN_ROUND, Shape2D::JOIN_BEVEL};
for(int row=0; row<3; ++row){
float y=(300+row*60)*s;
Shape2D p; p.mt(60*s,y).lt(110*s,y-34*s).lt(160*s,y).lt(210*s,y-34*s).lt(260*s,y).set_line_width(16*s).set_line_join(joins[row]).set_miter_limit(4.0f).set_line_cap(Shape2D::CAP_BUTT);
g_capjoin_canvas->fill_style(tr).stroke_style(jc[row]).path(p);
}
{
Shape2D a; a.mt(330*s,340*s).lt(355*s,260*s).lt(380*s,340*s).set_line_width(14*s).set_line_join(Shape2D::JOIN_MITER).set_miter_limit(1.0f);
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(255,150,50,255)).path(a);
Shape2D b; b.mt(420*s,340*s).lt(445*s,260*s).lt(470*s,340*s).set_line_width(14*s).set_line_join(Shape2D::JOIN_MITER).set_miter_limit(10.0f);
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(255,150,50,255)).path(b);
Shape2D c; c.mt(510*s,340*s).lt(535*s,260*s).lt(560*s,340*s).set_line_width(14*s).set_line_join(Shape2D::JOIN_ROUND);
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(255,150,50,255)).path(c);
Shape2D d; d.mt(600*s,340*s).lt(625*s,260*s).lt(650*s,340*s).set_line_width(14*s).set_line_join(Shape2D::JOIN_BEVEL);
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(255,150,50,255)).path(d);
}
{
Shape2D tri; tri.mt(90*s,560*s).lt(140*s,470*s).lt(190*s,560*s).close().set_line_width(12*s).set_line_join(Shape2D::JOIN_ROUND).set_line_cap(Shape2D::CAP_SQUARE);
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(100,255,150,255)).path(tri);
Shape2D star; float cx=280*s, cy=515*s, ro=55*s, ri=22*s;
for(int i=0;i<5;++i){
float ao=(i*72-90)*3.14159f/180.0f, ai=((i*72)+36-90)*3.14159f/180.0f;
if(i==0) star.mt(cx+ro*std::cos(ao), cy+ro*std::sin(ao)); else star.lt(cx+ro*std::cos(ao), cy+ro*std::sin(ao));
star.lt(cx+ri*std::cos(ai), cy+ri*std::sin(ai));
}
star.close().set_line_width(7*s).set_line_join(Shape2D::JOIN_MITER).set_miter_limit(4.0f);
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(255,220,100,255)).path(star);
Shape2D wave; wave.mt(380*s,560*s).qt(420*s,460*s, 460*s,520*s).qt(500*s,580*s, 540*s,500*s).set_line_width(14*s).set_line_cap(Shape2D::CAP_ROUND).set_line_join(Shape2D::JOIN_ROUND);
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(150,150,255,255)).path(wave);
Shape2D zig2; zig2.mt(590*s,560*s).lt(620*s,490*s).lt(650*s,540*s).lt(680*s,470*s).set_line_width(12*s).set_line_cap(Shape2D::CAP_SQUARE).set_line_join(Shape2D::JOIN_BEVEL);
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(255,130,200,255)).path(zig2);
}
{
Shape2D a1; a1.mt(120*s+40*s*std::cos(0.4f), 650*s+40*s*std::sin(0.4f)).at(120*s, 650*s, 40*s, 0.4f, 4.6f, false).set_line_width(16*s).set_line_cap(Shape2D::CAP_BUTT);
g_capjoin_canvas->stroke_style(rgba(255,180,80,255)).path(a1);
Shape2D a2; a2.mt(300*s+40*s*std::cos(0.4f), 650*s+40*s*std::sin(0.4f)).at(300*s, 650*s, 40*s, 0.4f, 4.6f, false).set_line_width(16*s).set_line_cap(Shape2D::CAP_ROUND);
g_capjoin_canvas->stroke_style(rgba(80,255,180,255)).path(a2);
Shape2D a3; a3.mt(480*s+40*s*std::cos(0.4f), 650*s+40*s*std::sin(0.4f)).at(480*s, 650*s, 40*s, 0.4f, 4.6f, false).set_line_width(16*s).set_line_cap(Shape2D::CAP_SQUARE);
g_capjoin_canvas->stroke_style(rgba(180,80,255,255)).path(a3);
}
// ------------------------------------------------------------------
// SVG 2 stroke-linejoin: miter-clip - the miter is CLIPPED at the limit
// instead of collapsing to a bevel. Dashed guides mark the cut distance
// (miter_limit * stroke-width / 2 from the vertex).
// ------------------------------------------------------------------
const uint32_t dim = rgba(175,180,195,255), head = rgba(120,200,255,255);
auto jlabel = [&](const char* txt, float x, float y, float px, uint32_t col) {
if (!g_font) return;
g_font->set_pixel_height(px * s);
g_capjoin_canvas->font(g_font).fill_style(col).stroke_style(tr).fill_text(txt, x * s, y * s);
};
auto jv = [&](float cx, float cy, float deg, float len, float w, Shape2D::LineJoin j, float lim) {
const float h = deg * 0.5f * 0.01745329251994329577f;
const float ax = std::sin(h) * len, ay = std::cos(h) * len;
Shape2D p;
p.mt((cx - ax) * s, (cy + ay) * s).lt(cx * s, cy * s).lt((cx + ax) * s, (cy + ay) * s);
p.set_line_width(w * s).set_line_join(j).set_miter_limit(lim);
return p;
};
auto jcut = [&](float cx, float cy, float w, float lim) {
const float y = (cy - lim * w * 0.5f) * s;
Shape2D g; g.mt((cx - 28) * s, y).lt((cx + 28) * s, y).set_line_width(1.0f).set_dash_array({4, 4});
g_capjoin_canvas->fill_style(tr).stroke_style(gs).path(g);
};
jlabel("stroke-linejoin: miter-clip (SVG 2)", 30, 706, 24, head);
{
const float cx[4] = {90, 250, 410, 570};
const Shape2D::LineJoin jj[4] = {Shape2D::JOIN_MITER, Shape2D::JOIN_MITER, Shape2D::JOIN_MITER_CLIP, Shape2D::JOIN_ROUND};
const float ll[4] = {8.0f, 1.5f, 1.5f, 1.5f};
const char* lb[4] = {"miter 8", "miter 1.5", "miter-clip 1.5", "round"};
const uint32_t cc[4] = {rgba(255,200,50,255), rgba(255,120,120,255), rgba(120,255,170,255), rgba(200,100,255,255)};
for (int i = 0; i < 4; ++i) {
if (i == 2) jcut(cx[i], 790, 18, ll[i]);
Shape2D p = jv(cx[i], 790, 40, 42, 18, jj[i], ll[i]);
g_capjoin_canvas->fill_style(tr).stroke_style(cc[i]).path(p);
jlabel(lb[i], cx[i] - 42, 852, 15, dim);
}
}
jlabel("miter-clip: stroke-miterlimit sweep", 30, 886, 24, head);
{
const float lims[7] = {1.0f, 1.2f, 1.4f, 1.6f, 1.8f, 2.0f, 2.6f};
for (int i = 0; i < 7; ++i) {
const float cx = 60 + i * 95.0f;
jcut(cx, 960, 16, lims[i]);
Shape2D p = jv(cx, 960, 40, 34, 16, Shape2D::JOIN_MITER_CLIP, lims[i]);
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(255,220,100,255)).path(p);
char lb[8]; std::snprintf(lb, sizeof(lb), "%.1f", lims[i]);
jlabel(lb, cx - 12, 1012, 15, dim);
}
}
{
Shape2D tri; tri.mt(110*s,1035*s).lt(160*s,1095*s).lt(60*s,1095*s).close()
.set_line_width(12*s).set_line_join(Shape2D::JOIN_MITER_CLIP).set_miter_limit(1.2f);
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(100,255,150,255)).path(tri);
Shape2D star; const float scx = 250, scy = 1065, sro = 32, sri = 13;
for (int i = 0; i < 5; ++i) {
const float ao = (i*72-90)*3.14159265f/180.0f, ai = ((i*72)+36-90)*3.14159265f/180.0f;
if (i == 0) star.mt((scx+sro*std::cos(ao))*s, (scy+sro*std::sin(ao))*s);
else star.lt((scx+sro*std::cos(ao))*s, (scy+sro*std::sin(ao))*s);
star.lt((scx+sri*std::cos(ai))*s, (scy+sri*std::sin(ai))*s);
}
star.close().set_line_width(6*s).set_line_join(Shape2D::JOIN_MITER_CLIP).set_miter_limit(2.0f);
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(255,220,100,255)).path(star);
Shape2D zig; zig.mt(320*s,1090*s).lt(350*s,1040*s).lt(380*s,1090*s).lt(410*s,1040*s).lt(440*s,1090*s)
.set_line_width(10*s).set_line_join(Shape2D::JOIN_MITER_CLIP).set_miter_limit(1.5f).set_dash_array({16*s,10*s});
g_capjoin_canvas->fill_style(tr).stroke_style(rgba(255,130,200,255)).path(zig);
static LinearGradient* cj_lg = nullptr; if (cj_lg) delete cj_lg;
cj_lg = new LinearGradient(-30, -24, 30, 24);
cj_lg->add_stop(0, rgba(255,80,80,255)).add_stop(1, rgba(80,200,255,255));
g_capjoin_canvas->save();
g_capjoin_canvas->translate(590*s, 1070*s).rotate(-0.5f).scale(1.2f*s, 1.2f*s);
Shape2D cv; cv.mt(-26,20).lt(0,-24).lt(26,20).set_line_width(14).set_line_join(Shape2D::JOIN_MITER_CLIP).set_miter_limit(1.4f);
g_capjoin_canvas->fill_style(tr).stroke_style(cj_lg).path(cv);
g_capjoin_canvas->restore();
jlabel("closed", 78, 1112, 14, dim);
jlabel("star", 232, 1112, 14, dim);
jlabel("dashed", 356, 1112, 14, dim);
jlabel("CTM + gradient", 528, 1112, 14, dim);
}
return 1;
}
ag_export(run_gradient_demo)
uint32_t run_gradient_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 800; height = 900; }
if (g_gradient_canvas) delete g_gradient_canvas;
g_gradient_canvas = new Canvas2D(width, height);
g_gradient_canvas->clear(rgba(240,240,245,255));
float s = width / 800.0f;
auto draw_label = [&](const char* text, float x, float y) {
if (g_font) {
g_font->set_pixel_height(16 * s);
g_gradient_canvas->font(g_font).fill_style(rgba(50,50,50,255)).fill_text(text, x, y);
}
};
float row_h = 150 * s;
float y_off = 40 * s;
draw_label("Spread: Pad", 50*s, y_off);
static LinearGradient* lg_pad = nullptr; if(lg_pad) delete lg_pad;
lg_pad = new LinearGradient(150*s, y_off + 20*s, 350*s, y_off + 20*s);
lg_pad->add_stop(0.2f, rgba(255,0,0,255)).add_stop(0.8f, rgba(0,0,255,255));
lg_pad->set_spread(Gradient::Spread::Pad);
Shape2D r_pad; r_pad.mt(50*s, y_off + 20*s).lt(450*s, y_off + 20*s).lt(450*s, y_off + 80*s).lt(50*s, y_off + 80*s).close();
g_gradient_canvas->fill_style(lg_pad).path(r_pad);
draw_label("Spread: Repeat", 50*s, y_off + row_h);
static LinearGradient* lg_rep = nullptr; if(lg_rep) delete lg_rep;
lg_rep = new LinearGradient(150*s, y_off + row_h + 20*s, 350*s, y_off + row_h + 20*s);
lg_rep->add_stop(0.2f, rgba(255,0,0,255)).add_stop(0.8f, rgba(0,0,255,255));
lg_rep->set_spread(Gradient::Spread::Repeat);
Shape2D r_rep; r_rep.mt(50*s, y_off + row_h + 20*s).lt(450*s, y_off + row_h + 20*s).lt(450*s, y_off + 80*s).lt(50*s, y_off + 80*s).close();
g_gradient_canvas->fill_style(lg_rep).path(r_rep);
draw_label("Spread: Reflect", 50*s, y_off + row_h * 2);
static LinearGradient* lg_ref = nullptr; if(lg_ref) delete lg_ref;
lg_ref = new LinearGradient(150*s, y_off + row_h * 2 + 20*s, 350*s, y_off + row_h * 2 + 20*s);
lg_ref->add_stop(0.2f, rgba(255,0,0,255)).add_stop(0.8f, rgba(0,0,255,255));
lg_ref->set_spread(Gradient::Spread::Reflect);
Shape2D r_ref; r_ref.mt(50*s, y_off + row_h * 2 + 20*s).lt(450*s, y_off + row_h * 2 + 20*s).lt(450*s, y_off + row_h + 80*s).lt(50*s, y_off + row_h + 80*s).close();
g_gradient_canvas->fill_style(lg_ref).path(r_ref);
draw_label("Radial Repeat", 500*s, y_off);
static RadialGradient* rg_rep = nullptr; if(rg_rep) delete rg_rep;
rg_rep = new RadialGradient(650*s, y_off + 50*s, 60*s, 650*s, y_off + 50*s, 0.0f);
rg_rep->add_stop(0.0f, rgba(255,255,0,255)).add_stop(0.5f, rgba(255,0,255,255));
rg_rep->set_spread(Gradient::Spread::Repeat);
Shape2D c_rep; c_rep.mt(500*s, y_off).lt(800*s, y_off).lt(800*s, y_off + 100*s).lt(500*s, y_off + 100*s).close();
g_gradient_canvas->fill_style(rg_rep).path(c_rep);
draw_label("Radial Reflect", 500*s, y_off + row_h);
static RadialGradient* rg_ref = nullptr; if(rg_ref) delete rg_ref;
rg_ref = new RadialGradient(650*s, y_off + row_h + 50*s, 60*s, 650*s, y_off + row_h + 50*s, 0.0f);
rg_ref->add_stop(0.0f, rgba(0,255,255,255)).add_stop(0.5f, rgba(0,0,0,255));
rg_ref->set_spread(Gradient::Spread::Reflect);
Shape2D c_ref; c_ref.mt(500*s, y_off + row_h).lt(800*s, y_off + row_h).lt(800*s, y_off + 100*s).lt(500*s, y_off + 100*s).close();
g_gradient_canvas->fill_style(rg_ref).path(c_ref);
y_off += row_h * 3 + 20*s;
draw_label("Radial fr=0 (Standard)", 50*s, y_off);
static RadialGradient* rg_fr0 = nullptr; if(rg_fr0) delete rg_fr0;
rg_fr0 = new RadialGradient(150*s, y_off + 60*s, 80*s, 110*s, y_off + 60*s, 0.0f);
rg_fr0->add_stop(0, rgba(255,255,255,255)).add_stop(1, rgba(255,0,0,255));
Shape2D circ0; circ0.mt(230*s, y_off + 60*s).at(150*s, y_off + 60*s, 80*s, 0, 6.2831853f, false).close();
g_gradient_canvas->fill_style(rg_fr0).path(circ0);
draw_label("Radial fr=40 (Cone)", 300*s, y_off);
static RadialGradient* rg_fr40 = nullptr; if(rg_fr40) delete rg_fr40;
rg_fr40 = new RadialGradient(400*s, y_off + 60*s, 80*s, 360*s, y_off + 60*s, 40.0f*s);
rg_fr40->add_stop(0, rgba(255,255,255,255)).add_stop(1, rgba(0,0,255,255));
Shape2D circ40; circ40.mt(480*s, y_off + 60*s).at(400*s, y_off + 60*s, 80*s, 0, 6.2831853f, false).close();
g_gradient_canvas->fill_style(rg_fr40).path(circ40);
draw_label("Radial fr=r (Solid edge)", 550*s, y_off);
static RadialGradient* rg_frr = nullptr; if(rg_frr) delete rg_frr;
rg_frr = new RadialGradient(650*s, y_off + 60*s, 80*s, 650*s, y_off + 60*s, 80.0f*s);
rg_frr->add_stop(0, rgba(0,255,0,255)).add_stop(1, rgba(0,0,0,255));
Shape2D circr; circr.mt(730*s, y_off + 60*s).at(650*s, y_off + 60*s, 80*s, 0, 6.2831853f, false).close();
g_gradient_canvas->fill_style(rg_frr).path(circr);
y_off += 150 * s;
draw_label("Transform: Rotate 45deg", 50*s, y_off);
static LinearGradient* lg_rot = nullptr; if(lg_rot) delete lg_rot;
lg_rot = new LinearGradient(-50*s, 0, 50*s, 0);
lg_rot->add_stop(0, rgba(255,100,0,255)).add_stop(1, rgba(100,0,255,255));
lg_rot->set_spread(Gradient::Spread::Repeat);
float cs = std::cos(0.785398f), sn = std::sin(0.785398f);
lg_rot->set_transform(cs, sn, -sn, cs, 150*s, y_off + 60*s);
Shape2D sq_rot; sq_rot.mt(50*s, y_off).lt(250*s, y_off).lt(250*s, y_off + 120*s).lt(50*s, y_off + 120*s).close();
g_gradient_canvas->fill_style(lg_rot).path(sq_rot);
draw_label("Transform: Scale & Skew", 300*s, y_off);
static RadialGradient* rg_trans = nullptr; if(rg_trans) delete rg_trans;
rg_trans = new RadialGradient(0, 0, 50*s, 0, 0, 0);
rg_trans->add_stop(0, rgba(255,255,0,255)).add_stop(1, rgba(255,0,100,255));
rg_trans->set_transform(1.5f, 0.5f, -0.2f, 0.8f, 400*s, y_off + 60*s);
Shape2D sq_trans; sq_trans.mt(300*s, y_off).lt(500*s, y_off).lt(500*s, y_off + 120*s).lt(300*s, y_off + 120*s).close();
g_gradient_canvas->fill_style(rg_trans).path(sq_trans);
draw_label("Conical Transform", 550*s, y_off);
static ConicalGradient* cg_trans = nullptr; if(cg_trans) delete cg_trans;
cg_trans = new ConicalGradient(0, 0, 0);
cg_trans->add_stop(0, rgba(0,255,255,255)).add_stop(0.5f, rgba(255,0,255,255)).add_stop(1, rgba(0,255,255,255));
cg_trans->set_transform(1.0f, 0.0f, 0.0f, 1.5f, 650*s, y_off + 60*s);
Shape2D sq_cg; sq_cg.mt(550*s, y_off).lt(750*s, y_off).lt(750*s, y_off + 120*s).lt(550*s, y_off + 120*s).close();
g_gradient_canvas->fill_style(cg_trans).path(sq_cg);
return 1;
}
ag_export(run_text_shadow_demo)
uint32_t run_text_shadow_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 600; height = 400; }
if (g_text_shadow_canvas) delete g_text_shadow_canvas;
g_text_shadow_canvas = new Canvas2D(width, height);
float s=width/600.0f;
static LinearGradient* bg=nullptr; if(bg) delete bg;
bg = new LinearGradient(0, 0, 0, height);
bg->add_stop(0, rgba(40,40,60,255)).add_stop(1, rgba(180,180,200,255));
Shape2D bgr; bgr.mt(0,0).lt(width,0).lt(width,height).lt(0,height).close();
g_text_shadow_canvas->fill_style(bg).path(bgr);
if (!g_font) return 0;
g_text_shadow_canvas->font(g_font); g_font->set_pixel_height(80*s);
static LinearGradient* tg=nullptr; if(tg) delete tg;
tg = new LinearGradient(100*s, 150*s, 500*s, 250*s);
tg->add_stop(0, rgba(255,100,150,255)).add_stop(0.5f, rgba(100,255,200,255)).add_stop(1, rgba(100,150,255,255));
// SVG 2 §10: shadowed text now uses anchor + weight + letter-spacing.
TextStyle t1; t1.font_size = 80*s; t1.anchor = TextAnchor::Middle;
t1.font_weight = 700; t1.letter_spacing = 2*s;
g_text_shadow_canvas->drop_shadow(15*s, 15*s, 4*s, rgba(0,0,0,220));
g_text_shadow_canvas->fill_style(tg).fill_text("Drop Shadow", 300*s, 180*s, t1);
TextStyle t2; t2.font_size = 100*s; t2.anchor = TextAnchor::Middle;
t2.font_weight = 900; t2.font_style = FontStyle::Italic; t2.letter_spacing = 4*s;
g_text_shadow_canvas->drop_shadow(0, 0, 25*s, rgba(255,220,50,255));
g_text_shadow_canvas->fill_style(rgba(255,255,255,255)).fill_text("NEON GLOW", 300*s, 320*s, t2);
g_text_shadow_canvas->clear_shadow();
return 1;
}
ag_export(run_transform_demo)
uint32_t run_transform_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 700; height = 700; }
if (g_transform_canvas) delete g_transform_canvas;
g_transform_canvas = new Canvas2D(width, height);
float s = width / 700.0f;
g_transform_canvas->clear(rgba(240, 240, 245, 255));
g_transform_canvas->save();
g_transform_canvas->translate(100*s, 100*s);
Shape2D r1; r1.mt(0, 0).lt(100*s, 0).lt(100*s, 100*s).lt(0, 100*s).close();
g_transform_canvas->fill_style(rgba(255, 100, 100, 255)).path(r1);
g_transform_canvas->restore();
g_transform_canvas->save();
g_transform_canvas->translate(300*s, 100*s);
g_transform_canvas->rotate(0.785398f);
Shape2D r2; r2.mt(-50*s, -50*s).lt(50*s, -50*s).lt(50*s, 50*s).lt(-50*s, 50*s).close();
g_transform_canvas->fill_style(rgba(100, 255, 100, 255)).path(r2);
g_transform_canvas->restore();
g_transform_canvas->save();
g_transform_canvas->translate(500*s, 100*s);
g_transform_canvas->scale(1.5f, 1.5f);
Shape2D r3; r3.mt(-33*s, -33*s).lt(33*s, -33*s).lt(33*s, 33*s).lt(-33*s, 33*s).close();
g_transform_canvas->fill_style(rgba(100, 100, 255, 255)).path(r3);
g_transform_canvas->restore();
g_transform_canvas->save();
g_transform_canvas->translate(300*s, 350*s);
g_transform_canvas->rotate(0.5f);
g_transform_canvas->scale(1.2f, 0.8f);
static LinearGradient* lg = nullptr;
if (lg) delete lg;
lg = new LinearGradient(-100*s, -100*s, 100*s, 100*s);
lg->add_stop(0, rgba(255, 0, 0, 255)).add_stop(1, rgba(0, 0, 255, 255));
Shape2D r4; r4.mt(-100*s, -100*s).lt(100*s, -100*s).lt(100*s, 100*s).lt(-100*s, 100*s).close();
g_transform_canvas->fill_style(lg).path(r4);
g_transform_canvas->restore();
if (g_font) {
g_transform_canvas->save();
g_transform_canvas->font(g_font);
g_font->set_pixel_height(36*s);
g_transform_canvas->translate(175*s, 575*s);
g_transform_canvas->rotate(-0.35f);
g_transform_canvas->scale(1.3f, 1.3f);
static LinearGradient* tg = nullptr;
if (tg) delete tg;
tg = new LinearGradient(-100*s, -20*s, 100*s, 20*s);
tg->add_stop(0, rgba(255, 50, 100, 255))
.add_stop(0.5f, rgba(255, 200, 50, 255))
.add_stop(1, rgba(50, 200, 255, 255));
// text-anchor: middle centres the run on the local origin before the CTM.
g_transform_canvas->text_anchor(TextAnchor::Middle).letter_spacing(1.0f*s);
g_transform_canvas->fill_style(tg);
g_transform_canvas->fill_text("Transformed", 0, 0);
g_transform_canvas->stroke_style(rgba(0, 0, 0, 200));
g_transform_canvas->stroke_text("Transformed", 0, 0);
g_transform_canvas->restore();
}
if (g_prefetched_image_data && g_prefetched_image_size > 0) {
Image img;
if (img.loadFromMemory(g_prefetched_image_data, (int)g_prefetched_image_size, 0)) {
g_transform_canvas->save();
g_transform_canvas->translate(525*s, 575*s);
g_transform_canvas->rotate(0.4f);
float iw = img.getWidth(), ih = img.getHeight();
float max_dim = 120*s;
float img_scale = max_dim / std::max(iw, ih);
g_transform_canvas->scale(img_scale, img_scale);
g_transform_canvas->draw_image(img, -iw*0.5f, -ih*0.5f, iw, ih);
g_transform_canvas->restore();
}
}
return 1;
}
ag_export(run_blend_demo)
uint32_t run_blend_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 600; height = 600; }
if (g_blend_canvas) delete g_blend_canvas;
g_blend_canvas = new Canvas2D(width, height);
float s = width / 600.0f;
g_blend_canvas->clear(rgba(240, 240, 245, 255));
uint32_t c1 = rgba(220, 220, 220, 255), c2 = rgba(180, 180, 180, 255), tr = rgba(0,0,0,0);
int cs = 20;
for (int y = 0; y < height; y += cs) {
for (int x = 0; x < width; x += cs) {
Shape2D p; p.mt(x,y).lt(x+cs,y).lt(x+cs,y+cs).lt(x,y+cs).close();
g_blend_canvas->fill_style(((x/cs)+(y/cs))%2==0 ? c1 : c2).stroke_style(tr).path(p);
}
}
const char* modes[] = {"Normal", "Multiply", "Screen", "Overlay", "Darken", "Lighten", "ColorDodge", "ColorBurn", "HardLight", "SoftLight", "Difference", "Exclusion"};
BlendMode blend_modes[] = {BlendMode::Normal, BlendMode::Multiply, BlendMode::Screen, BlendMode::Overlay, BlendMode::Darken, BlendMode::Lighten, BlendMode::ColorDodge, BlendMode::ColorBurn, BlendMode::HardLight, BlendMode::SoftLight, BlendMode::Difference, BlendMode::Exclusion};
int cols = 4, rows = 3;
float cw = (width - 40*s) / cols, ch = (height - 40*s) / rows;
for (int i = 0; i < 12; ++i) {
int c = i % cols, r = i / cols;
float cx = 20*s + c * cw + cw/2, cy = 20*s + r * ch + ch/2;
float radius = std::min(cw, ch) * 0.30f;
Shape2D sq; sq.mt(cx - radius, cy - radius).lt(cx + radius, cy - radius).lt(cx + radius, cy + radius).lt(cx - radius, cy + radius).close();
g_blend_canvas->fill_style(rgba(0, 150, 255, 200)).stroke_style(rgba(0, 100, 200, 255)).path(sq);
Shape2D ci; ci.mt(cx, cy).at(cx, cy, radius, 0, 6.2831853f, false).close();
g_blend_canvas->blend_mode(blend_modes[i]).fill_style(rgba(255, 100, 50, 200)).stroke_style(rgba(200, 50, 0, 255)).path(ci);
g_blend_canvas->blend_mode(BlendMode::Normal);
if (g_font) {
g_blend_canvas->font(g_font);
g_font->set_pixel_height(22*s);
g_blend_canvas->fill_style(rgba(0,0,0,255)).fill_text(modes[i], cx - radius, cy + radius + 28*s);
}
}
return 1;
}
// ======================================================================
// TEST 14: PATTERNS (SVG 2 §3.3)
// Image / Path2D(vector) / Gradient content + patternContentUnits.
// NOTE: every Shape2D / Gradient stored in a Pattern MUST outlive it, so all
// pattern content here lives in function-static storage (same rule as Mask
// and Marker). The tile buffer is compiled up-front by draw_shape_impl.
// ======================================================================
ag_export(run_pattern_demo)
uint32_t run_pattern_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 600; height = 700; }
if (g_pattern_canvas) delete g_pattern_canvas;
g_pattern_canvas = new Canvas2D(width, height);
g_pattern_canvas->clear(rgba(245,245,250,255));
float s = width / 600.0f;
uint32_t tr = rgba(0,0,0,0);
// ---- static content storage (outlives the static Patterns) ----
static Image* pattern_img = nullptr;
static Pattern *pat_img = nullptr, *pat_vec = nullptr, *pat_grad = nullptr,
*pat_obb = nullptr, *pat_xform = nullptr, *pat_stroke = nullptr, *pat_radial = nullptr;
static LinearGradient* tile_lg = nullptr;
static RadialGradient* tile_rg = nullptr;
static Shape2D vec_star, vec_dot, grad_rect, obb_circ, stripe1, stripe2,
chk1, chk2, tile_bg, wave;
for (Pattern** pp : {&pat_img,&pat_vec,&pat_grad,&pat_obb,&pat_xform,&pat_stroke,&pat_radial}) { if (*pp) { delete *pp; *pp = nullptr; } }
if (tile_lg) { delete tile_lg; tile_lg = nullptr; }
if (tile_rg) { delete tile_rg; tile_rg = nullptr; }
if (pattern_img) { delete pattern_img; pattern_img = nullptr; }
// ---- 1: Image pattern ----
bool have_img = false;
if (g_prefetched_image_data && g_prefetched_image_size > 0) {
pattern_img = new Image();
have_img = pattern_img->loadFromMemory(g_prefetched_image_data, (int)g_prefetched_image_size, 0);
if (!have_img) { delete pattern_img; pattern_img = nullptr; }
}
if (have_img) {
pat_img = new Pattern(pattern_img, 80*s, 80*s, Pattern::Units::UserSpaceOnUse, true, true);
Shape2D r1; r1.mt(20*s, 20*s).lt(280*s, 20*s).lt(280*s, 140*s).lt(20*s, 140*s).close();
g_pattern_canvas->fill_style(pat_img).path(r1);
}
// ---- 2: Pattern from Path2D vector content ----
vec_star = Shape2D();
vec_star.mt(30*s, 5*s).lt(36*s, 22*s).lt(55*s, 22*s).lt(40*s, 33*s)
.lt(46*s, 50*s).lt(30*s, 40*s).lt(14*s, 50*s).lt(20*s, 33*s)
.lt(5*s, 22*s).lt(24*s, 22*s).close().set_line_width(1.5f*s);
vec_dot = Shape2D();
vec_dot.mt(11*s, 8*s).at(8*s, 8*s, 3*s, 0, 6.2831853f, false).close();
pat_vec = new Pattern(60*s, 60*s, Pattern::Units::UserSpaceOnUse, Pattern::ContentUnits::UserSpaceOnUse, true, true);
pat_vec->add(vec_star, Paint(rgba(255, 180, 0, 255)), Paint(rgba(200, 100, 0, 255)));
pat_vec->add(vec_dot, Paint(rgba(100, 50, 200, 200)), Paint(tr));
{
Shape2D r2; r2.mt(320*s, 20*s).lt(580*s, 20*s).lt(580*s, 140*s).lt(320*s, 140*s).close();
g_pattern_canvas->fill_style(pat_vec).path(r2);
}
// ---- 3: Pattern from Gradient content ----
tile_lg = new LinearGradient(0, 0, 100*s, 50*s);
tile_lg->add_stop(0.0f, rgba(0, 200, 255, 255)).add_stop(0.5f, rgba(255, 0, 200, 255)).add_stop(1.0f, rgba(255, 255, 0, 255));
grad_rect = Shape2D();
grad_rect.mt(0, 0).lt(100*s, 0).lt(100*s, 50*s).lt(0, 50*s).close();
pat_grad = new Pattern(100*s, 50*s, Pattern::Units::UserSpaceOnUse, Pattern::ContentUnits::UserSpaceOnUse, true, true);
pat_grad->add(grad_rect, Paint(tile_lg), Paint(tr));
{
Shape2D r3; r3.mt(20*s, 170*s).lt(580*s, 170*s).lt(580*s, 270*s).lt(20*s, 270*s).close();
g_pattern_canvas->fill_style(pat_grad).path(r3);
}
// ---- 4: patternContentUnits = objectBoundingBox ----
obb_circ = Shape2D();
obb_circ.mt(0.225f, 0.125f).at(0.125f, 0.125f, 0.1f, 0, 6.2831853f, false).close().set_line_width(0.01f);
pat_obb = new Pattern(0.25f, 0.25f, Pattern::Units::ObjectBoundingBox, Pattern::ContentUnits::ObjectBoundingBox, true, true);
pat_obb->add(obb_circ, Paint(rgba(50, 200, 100, 255)), Paint(rgba(20, 100, 50, 255)));
{
Shape2D r4; r4.mt(20*s, 300*s).lt(580*s, 300*s).lt(580*s, 420*s).lt(20*s, 420*s).close();
g_pattern_canvas->fill_style(pat_obb).path(r4);
}
// ---- 5: patternTransform (rotate) ----
stripe1 = Shape2D(); stripe1.mt(0, 0).lt(10*s, 0).lt(10*s, 40*s).lt(0, 40*s).close();
stripe2 = Shape2D(); stripe2.mt(20*s, 0).lt(30*s, 0).lt(30*s, 40*s).lt(20*s, 40*s).close();
pat_xform = new Pattern(40*s, 40*s, Pattern::Units::UserSpaceOnUse, Pattern::ContentUnits::UserSpaceOnUse, true, true);
pat_xform->add(stripe1, Paint(rgba(255, 50, 50, 255)), Paint(tr));
pat_xform->add(stripe2, Paint(rgba(50, 50, 255, 255)), Paint(tr));
{
float ang = 0.5236f;
pat_xform->set_transform(std::cos(ang), std::sin(ang), -std::sin(ang), std::cos(ang), 0, 0);
Shape2D r5; r5.mt(20*s, 450*s).lt(280*s, 450*s).lt(280*s, 570*s).lt(20*s, 570*s).close();
g_pattern_canvas->fill_style(pat_xform).path(r5);
}
// ---- 6: Pattern as stroke paint (checkerboard vector tile) ----
chk1 = Shape2D(); chk1.mt(0, 0).lt(15*s, 0).lt(15*s, 15*s).lt(0, 15*s).close();
chk2 = Shape2D(); chk2.mt(15*s, 15*s).lt(30*s, 15*s).lt(30*s, 30*s).lt(15*s, 30*s).close();
pat_stroke = new Pattern(30*s, 30*s, Pattern::Units::UserSpaceOnUse, Pattern::ContentUnits::UserSpaceOnUse, true, true);
pat_stroke->add(chk1, Paint(rgba(0, 0, 0, 255)), Paint(tr));
pat_stroke->add(chk2, Paint(rgba(0, 0, 0, 255)), Paint(tr));
wave = Shape2D();
wave.mt(320*s, 510*s).ct(370*s, 450*s, 420*s, 570*s, 470*s, 510*s)
.ct(520*s, 450*s, 560*s, 570*s, 580*s, 510*s).set_line_width(20.0f*s);
g_pattern_canvas->fill_style(tr).stroke_style(pat_stroke).path(wave);
// ---- 7: Radial-gradient vector tile ----
tile_rg = new RadialGradient(35*s, 35*s, 35*s, 35*s, 35*s, 0.0f);
tile_rg->add_stop(0.0f, rgba(255, 255, 255, 255)).add_stop(1.0f, rgba(100, 0, 200, 255));
tile_bg = Shape2D();
tile_bg.mt(0, 0).lt(70*s, 0).lt(70*s, 70*s).lt(0, 70*s).close();
pat_radial = new Pattern(70*s, 70*s, Pattern::Units::UserSpaceOnUse, Pattern::ContentUnits::UserSpaceOnUse, true, true);
pat_radial->add(tile_bg, Paint(tile_rg), Paint(tr));
{
Shape2D r6; r6.mt(20*s, 600*s).lt(580*s, 600*s).lt(580*s, 680*s).lt(20*s, 680*s).close();
g_pattern_canvas->fill_style(pat_radial).path(r6);
}
return 1;
}
ag_export(run_dash_demo)
uint32_t run_dash_demo(uint32_t width, uint32_t height) {
if (width == 0 || height == 0) { width = 700; height = 860; }
if (g_dash_canvas) delete g_dash_canvas;
g_dash_canvas = new Canvas2D(width, height);
Canvas2D& c = *g_dash_canvas;
const float s = std::min(width / 700.0f, height / 860.0f);
const uint32_t bg = rgba(24,28,36,255), tr = rgba(0,0,0,0), guide = rgba(90,90,110,90);
const uint32_t dim = rgba(175,180,195,255), head = rgba(120,200,255,255), tick = rgba(200,200,220,110);
c.clear(bg);
c.save();
c.scale(s, s);
c.fill_style(tr).stroke_style(guide);
for (int gx = 0; gx <= 700; gx += 50) { Shape2D p; p.mt(gx,0).lt(gx,860).set_line_width(0.5f); c.path(p); }
for (int gy = 0; gy <= 860; gy += 50) { Shape2D p; p.mt(0,gy).lt(700,gy).set_line_width(0.5f); c.path(p); }
auto label = [&](const char* txt, float x, float y, float px, uint32_t col) {
if (!g_font) return;
g_font->set_pixel_height(px);
c.font(g_font).fill_style(col).stroke_style(tr).fill_text(txt, x, y);
};
auto section = [&](const char* txt, float y) { label(txt, 30, y, 28, head); };
auto sample = [&](float y, const std::vector<float>& dash, float off, float w, Shape2D::LineCap cap, uint32_t col) {
Shape2D p; p.mt(180, y).h(668).set_line_width(w).set_line_cap(cap).set_dash_array(dash).set_dash_offset(off);
c.fill_style(tr).stroke_style(col).path(p);
};
section("stroke-dasharray", 34);
sample(58, {15,10}, 0, 6, Shape2D::CAP_BUTT, rgba(255,120,120,255)); label("15 10", 30, 66, 24, dim);
sample(86, {30,10,6,10}, 0, 6, Shape2D::CAP_BUTT, rgba(255,200,80,255)); label("30 10 6 10", 30, 94, 24, dim);
sample(114, {8}, 0, 6, Shape2D::CAP_BUTT, rgba(120,220,120,255)); label("8 (odd)", 30, 122, 24, dim);
sample(142, {40,8,8,8,8,8}, 0, 6, Shape2D::CAP_BUTT, rgba(120,170,255,255)); label("40 8 8 8 8 8", 30, 150, 24, dim);
section("stroke-dashoffset (pattern 20 10)", 182);
const float offs[4] = {0, 10, 20, -10};
const char* olbl[4] = {"offset 0", "offset 10", "offset 20", "offset -10"};
for (int i = 0; i < 4; ++i) {
const float y = 206 + i * 28.0f;
Shape2D t; t.mt(180, y-11).lt(180, y+11).set_line_width(1.0f);
c.fill_style(tr).stroke_style(tick).path(t);
sample(y, {20,10}, offs[i], 6, Shape2D::CAP_BUTT, rgba(255,200,80,255));
label(olbl[i], 30, y+8, 24, dim);
}
section("stroke-linecap on dashes (18 14)", 330);
sample(352, {18,14}, 0, 14, Shape2D::CAP_BUTT, rgba(255,140,90,255)); label("butt", 30, 360, 24, dim);
sample(386, {18,14}, 0, 14, Shape2D::CAP_ROUND, rgba(255,140,90,255)); label("round", 30, 394, 24, dim);
sample(420, {18,14}, 0, 14, Shape2D::CAP_SQUARE, rgba(255,140,90,255)); label("square", 30, 428, 24, dim);
section("zero-length dashes = dots", 460);
sample(482, {0,22}, 0, 12, Shape2D::CAP_ROUND, rgba(190,120,255,255)); label("0 22 round", 30, 490, 24, dim);
sample(516, {0,26}, 0, 12, Shape2D::CAP_SQUARE, rgba(190,120,255,255)); label("0 26 square", 30, 524, 24, dim);
section("curves & closed subpaths", 556);
{
Shape2D wave; wave.mt(40,616).ct(100,566,170,666,240,616).st(300,566,350,616)
.set_line_width(8).set_line_cap(Shape2D::CAP_ROUND).set_line_join(Shape2D::JOIN_ROUND).set_dash_array({22,12});
c.fill_style(tr).stroke_style(rgba(90,200,255,255)).path(wave);
label("cubic + S", 40, 676, 19, dim);
Shape2D ring; ring.mt(497,612).et(42,42,0,false,true,413,612).et(42,42,0,false,true,497,612).close()
.set_line_width(10).set_line_join(Shape2D::JOIN_ROUND).set_dash_array({26,16});
c.stroke_style(rgba(120,255,170,255)).path(ring);
label("closed (A)", 424, 676, 19, dim);
Shape2D arc; arc.mt(600+38*std::cos(0.5f),612+38*std::sin(0.5f)).at(600,612,38,0.5f,5.0f,false)
.set_line_width(10).set_line_cap(Shape2D::CAP_ROUND).set_dash_array({18,12});
c.stroke_style(rgba(255,170,90,255)).path(arc);
label("arc", 588, 676, 19, dim);
}
section("joins / fill / gradient / CTM dash", 706);
{
Shape2D zig; zig.mt(40,766).lt(75,728).lt(110,766).lt(145,728).lt(180,766)
.set_line_width(10).set_line_join(Shape2D::JOIN_MITER).set_miter_limit(4.0f).set_dash_array({20,12});
c.fill_style(tr).stroke_style(rgba(255,220,100,255)).path(zig);
Shape2D rect; rect.mt(225,724).h(330).v(772).h(225).close()
.set_line_width(5).set_dash_array({12,8});
c.fill_style(rgba(80,140,255,70)).stroke_style(rgba(150,190,255,255)).path(rect);
static LinearGradient* lg = nullptr; if (lg) delete lg;
lg = new LinearGradient(370, 748, 555, 748);
lg->add_stop(0, rgba(255,80,80,255)).add_stop(0.5f, rgba(255,230,80,255)).add_stop(1, rgba(80,220,255,255));
Shape2D gl; gl.mt(370,748).h(555).set_line_width(12).set_line_cap(Shape2D::CAP_ROUND).set_dash_array({24,14});
c.fill_style(tr).stroke_style(lg).path(gl);
c.save();
c.translate(625, 748); c.rotate(-0.6f); c.scale(1.3f, 1.3f);
c.set_line_dash({12, 8}).line_dash_offset(4.0f);
Shape2D tl; tl.mt(-32,0).lt(32,0).set_line_width(8).set_line_cap(Shape2D::CAP_ROUND);
c.fill_style(tr).stroke_style(rgba(255,120,200,255)).path(tl);
c.restore();
}
section("invalid = solid / dashed text", 806);
{
Shape2D z; z.mt(40,832).h(185).set_line_width(6).set_dash_array({0,0});
c.fill_style(tr).stroke_style(rgba(160,160,175,255)).path(z);
label("0 0", 40, 852, 19, dim);
Shape2D neg; neg.mt(225,832).h(370).set_line_width(6).set_dash_array({-5,10});
c.stroke_style(rgba(160,160,175,255)).path(neg);
label("-5 10", 225, 852, 19, dim);
if (g_font) {
// SVG 2 §10: dashed text with letter-spacing + anchored + synthetic bold.
TextStyle ts; ts.font_size = 60; ts.anchor = TextAnchor::Middle;
ts.letter_spacing = 8.0f; ts.font_weight = 700;
c.font(g_font);
c.set_line_dash({10,6});
c.fill_style(tr).stroke_style(rgba(120,255,220,255)).stroke_text("DASH", 545, 845, ts);
c.set_line_dash({});
}
}
c.restore();
return 1;
}
// ============================================================================
// TEST 8b - NUMERIC IMAGE SELF-TEST (SVG 2 §9.2)
// preserveAspectRatio (none + 9 alignments x meet|slice) and image smoothing
// (nearest / bilinear / bicubic / area-average). Fully deterministic: uses
// synthetic pixel buffers, no prefetch required. Returns failure count (0 =
// all pass), mirroring the mask/clip/fill-rule/composite self-tests.
// ============================================================================
static uint32_t g_image_selftest_checks = 0;
ag_export(run_image_selftest)
uint32_t run_image_selftest() {
uint32_t fails = 0, checks = 0;
const uint32_t R = rgba(255,0,0,255), G = rgba(0,255,0,255), B = rgba(0,0,255,255);
const uint32_t W = rgba(255,255,255,255), K = rgba(0,0,0,255), TR = rgba(0,0,0,0);
auto expect = [&](int got, int want, int tol, const char* name) {
++checks;
if (got < want - tol || got > want + tol) {
++fails;
std::printf("[image self-test] FAIL %s: got %d, want %d (+/-%d)\n", name, got, want, tol);
}
};
auto A  = [](uint32_t v) { return (int)(v >> 24); };
auto Rr = [](uint32_t v) { return (int)(v & 255); };
auto Gg = [](uint32_t v) { return (int)((v >> 8) & 255); };
auto Bb = [](uint32_t v) { return (int)((v >> 16) & 255); };
// 1. nearest neighbour: exact source colours, correct quadrant mapping
{
const uint32_t img[4] = {R, G, B, W};
Canvas2D c(4, 4); c.clear(0);
c.image_smoothing_enabled(false).draw_pixels(img, 2, 2, 0, 0, 4, 4);
expect((int)c.get_buffer()[0*4+0], (int)R, 0, "nearest TL red");
expect((int)c.get_buffer()[0*4+3], (int)G, 0, "nearest TR green");
expect((int)c.get_buffer()[3*4+0], (int)B, 0, "nearest BL blue");
expect((int)c.get_buffer()[3*4+3], (int)W, 0, "nearest BR white");
Canvas2D d(6, 6); d.clear(0);
d.image_smoothing_enabled(false).draw_pixels(img, 2, 2, 0, 0, 6, 6);
expect((int)d.get_buffer()[2*6+2], (int)R, 0, "nearest 3x TL");
expect((int)d.get_buffer()[2*6+3], (int)G, 0, "nearest 3x TR");
expect((int)d.get_buffer()[3*6+2], (int)B, 0, "nearest 3x BL");
expect((int)d.get_buffer()[3*6+3], (int)W, 0, "nearest 3x BR");
}
// 2. defaults unchanged: legacy call == explicit None/Low; the toggle matters
{
const uint32_t img[4] = {R, rgba(0,255,0,128), B, TR};
Canvas2D a(9, 9), b(9, 9), d(9, 9);
a.clear(0); b.clear(0); d.clear(0);
a.draw_pixels(img, 2, 2, 1, 2, 7, 6);
b.image_smoothing_enabled(true).image_smoothing_quality(ImageSmoothingQuality::Low)
.draw_pixels(img, 2, 2, 1, 2, 7, 6, ImageAlign::None, ImageFit::Meet);
d.image_smoothing_enabled(false).draw_pixels(img, 2, 2, 1, 2, 7, 6);
expect(std::memcmp(a.get_buffer(), b.get_buffer(), 9*9*4) == 0 ? 1 : 0, 1, 0, "legacy == explicit None/Low");
expect(std::memcmp(a.get_buffer(), d.get_buffer(), 9*9*4) != 0 ? 1 : 0, 1, 0, "smoothing toggle changes output");
}
// 3. bilinear (Low, default) upscale mixes neighbouring pixels
{
const uint32_t img[4] = {R, G, B, W};
Canvas2D c(8, 8); c.clear(0);
c.draw_pixels(img, 2, 2, 0, 0, 8, 8);
const uint32_t p = c.get_buffer()[3*8+3];
expect(Rr(p), 135, 3, "bilinear mix R");
expect(Gg(p), 96, 3, "bilinear mix G");
expect(Bb(p), 96, 3, "bilinear mix B");
expect(A(p), 255, 0, "bilinear mix A");
}
// 4. Medium = bicubic (sharper than bilinear); High magnify == Medium
{
const uint32_t img[2] = {K, W};
Canvas2D lo(4, 1), me(4, 1), hi(4, 1), nn(4, 1);
lo.clear(0); me.clear(0); hi.clear(0); nn.clear(0);
lo.draw_pixels(img, 2, 1, 0, 0, 4, 1);
me.image_smoothing_quality(ImageSmoothingQuality::Medium).draw_pixels(img, 2, 1, 0, 0, 4, 1);
hi.image_smoothing_quality(ImageSmoothingQuality::High).draw_pixels(img, 2, 1, 0, 0, 4, 1);
nn.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 0, 0, 4, 1);
expect(Rr(lo.get_buffer()[1]), 64, 2, "bicubic-vs-bilinear: low");
expect(Rr(me.get_buffer()[1]), 52, 4, "bicubic medium");
expect(Rr(nn.get_buffer()[1]), 0, 0, "bicubic-vs-nearest");
expect(std::memcmp(me.get_buffer(), hi.get_buffer(), 4*4) == 0 ? 1 : 0, 1, 0, "high magnify == bicubic");
}
// 5. High = area average when minifying (bilinear/nearest miss the tail)
{
const uint32_t img[4] = {K, K, K, W};
Canvas2D hi(1, 1), lo(1, 1); hi.clear(0); lo.clear(0);
hi.image_smoothing_quality(ImageSmoothingQuality::High).draw_pixels(img, 4, 1, 0, 0, 1, 1);
lo.draw_pixels(img, 4, 1, 0, 0, 1, 1);
expect(Rr(hi.get_buffer()[0]), 64, 2, "area average 4->1");
expect(A(hi.get_buffer()[0]), 255, 0, "area average alpha");
expect(Rr(lo.get_buffer()[0]), 0, 0, "bilinear misses tail");
Canvas2D h2(2, 1); h2.clear(0);
h2.image_smoothing_quality(ImageSmoothingQuality::High).draw_pixels(img, 4, 1, 0, 0, 2, 1);
expect(Rr(h2.get_buffer()[0]), 0, 1, "area average 4->2 left");
expect(Rr(h2.get_buffer()[1]), 128, 2, "area average 4->2 right");
}
// 6. meet: all nine alignments (1x1 white -> 6x3 viewport, content 3x3)
{
const uint32_t img[1] = {W};
const ImageAlign aligns[9] = {ImageAlign::xMinYMin, ImageAlign::xMinYMid, ImageAlign::xMinYMax,
ImageAlign::xMidYMin, ImageAlign::xMidYMid, ImageAlign::xMidYMax,
ImageAlign::xMaxYMin, ImageAlign::xMaxYMid, ImageAlign::xMaxYMax};
for (int ai = 0; ai < 9; ++ai) {
Canvas2D c(6, 3); c.clear(0);
c.image_smoothing_enabled(false).draw_pixels(img, 1, 1, 0, 0, 6, 3, aligns[ai], ImageFit::Meet);
const int first = (ai / 3 == 0) ? 0 : (ai / 3 == 1 ? 1 : 3);
for (int x = 0; x < 6; ++x) {
const bool in = x >= first && x <= first + 2;
expect(A(c.get_buffer()[1*6+x]), in ? 255 : 0, 0, "meet align band");
}
}
}
// 7. meet: letterbox placement (2x1 {R,B} -> 4x4)
{
const uint32_t img[2] = {R, B};
Canvas2D c(4, 4); c.clear(0);
c.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 0, 0, 4, 4, ImageAlign::xMidYMid, ImageFit::Meet);
expect((int)c.get_buffer()[1*4+0], (int)R, 0, "meet mid left");
expect((int)c.get_buffer()[2*4+3], (int)B, 0, "meet mid right");
expect(A(c.get_buffer()[0*4+0]), 0, 0, "meet letterbox top");
expect(A(c.get_buffer()[3*4+0]), 0, 0, "meet letterbox bottom");
Canvas2D d(4, 4); d.clear(0);
d.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 0, 0, 4, 4, ImageAlign::xMinYMin, ImageFit::Meet);
expect((int)d.get_buffer()[0*4+0], (int)R, 0, "meet min/min top");
expect(A(d.get_buffer()[2*4+0]), 0, 0, "meet min/min below");
Canvas2D e(4, 4); e.clear(0);
e.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 0, 0, 4, 4, ImageAlign::xMaxYMax, ImageFit::Meet);
expect((int)e.get_buffer()[3*4+3], (int)B, 0, "meet max/max bottom");
expect(A(e.get_buffer()[0*4+0]), 0, 0, "meet max/max above");
}
// 8. slice: viewport crop + X alignment (2x1 {R,B} -> viewport (2,2,4,4))
{
const uint32_t img[2] = {R, B};
Canvas2D c(10, 10); c.clear(0);
c.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 2, 2, 4, 4, ImageAlign::xMidYMid, ImageFit::Slice);
expect((int)c.get_buffer()[4*10+2], (int)R, 0, "slice mid left half");
expect((int)c.get_buffer()[4*10+5], (int)B, 0, "slice mid right half");
expect(A(c.get_buffer()[4*10+1]), 0, 0, "slice crops left overflow");
expect(A(c.get_buffer()[4*10+6]), 0, 0, "slice crops right overflow");
expect(A(c.get_buffer()[1*10+2]), 0, 0, "slice crops top overflow");
expect(A(c.get_buffer()[6*10+2]), 0, 0, "slice crops bottom overflow");
expect(A(c.get_buffer()[2*10+2]), 255, 0, "slice fills viewport top");
expect(A(c.get_buffer()[5*10+2]), 255, 0, "slice fills viewport bottom");
Canvas2D d(4, 4); d.clear(0);
d.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 0, 0, 4, 4, ImageAlign::xMinYMin, ImageFit::Slice);
expect((int)d.get_buffer()[3*4+3], (int)R, 0, "slice min shows source left");
Canvas2D e(4, 4); e.clear(0);
e.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 0, 0, 4, 4, ImageAlign::xMaxYMax, ImageFit::Slice);
expect((int)e.get_buffer()[0*4+0], (int)B, 0, "slice max shows source right");
}
// 9. slice: Y alignment (1x2 {R;B} -> 4x4)
{
const uint32_t img[2] = {R, B};
Canvas2D a(4, 4), b(4, 4), d(4, 4); a.clear(0); b.clear(0); d.clear(0);
a.image_smoothing_enabled(false).draw_pixels(img, 1, 2, 0, 0, 4, 4, ImageAlign::xMidYMin, ImageFit::Slice);
b.image_smoothing_enabled(false).draw_pixels(img, 1, 2, 0, 0, 4, 4, ImageAlign::xMidYMid, ImageFit::Slice);
d.image_smoothing_enabled(false).draw_pixels(img, 1, 2, 0, 0, 4, 4, ImageAlign::xMidYMax, ImageFit::Slice);
expect((int)a.get_buffer()[3*4+2], (int)R, 0, "slice YMin bottom row");
expect((int)b.get_buffer()[0*4+2], (int)R, 0, "slice YMid top row");
expect((int)b.get_buffer()[3*4+2], (int)B, 0, "slice YMid bottom row");
expect((int)d.get_buffer()[0*4+2], (int)B, 0, "slice YMax top row");
}
// 10. none: independent x/y stretch (back-compat default)
{
const uint32_t img[2] = {R, B};
Canvas2D c(4, 4); c.clear(0);
c.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 0, 0, 4, 4, ImageAlign::None);
expect((int)c.get_buffer()[3*4+1], (int)R, 0, "none stretch left");
expect((int)c.get_buffer()[0*4+2], (int)B, 0, "none stretch right");
expect(A(c.get_buffer()[3*4+3]), 255, 0, "none fills viewport");
}
// 11. slice under CTM: the viewport crop follows the transform
{
const uint32_t img[2] = {R, B};
Canvas2D c(24, 10); c.clear(0);
c.save(); c.translate(10, 0); c.scale(2, 2);
c.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 0, 0, 4, 4, ImageAlign::xMidYMid, ImageFit::Slice);
c.restore();
expect(A(c.get_buffer()[4*24+9]), 0, 0, "CTM slice outside left");
expect((int)c.get_buffer()[4*24+10], (int)R, 0, "CTM slice inside left");
expect((int)c.get_buffer()[4*24+17], (int)B, 0, "CTM slice inside right");
expect(A(c.get_buffer()[4*24+18]), 0, 0, "CTM slice outside right");
expect(A(c.get_buffer()[8*24+12]), 0, 0, "CTM slice outside bottom");
}
// 12. layered path: slice + clip-path, meet + objectBoundingBox mask
{
const uint32_t img[2] = {R, B};
Canvas2D c(8, 8); c.clear(0);
Shape2D right; right.mt(4,0).lt(8,0).lt(8,8).lt(4,8).close();
ClipPath cp; cp.add(right);
c.set_clip(&cp).image_smoothing_enabled(false)
.draw_pixels(img, 2, 1, 0, 0, 8, 8, ImageAlign::xMidYMid, ImageFit::Slice);
c.clear_clip();
expect(A(c.get_buffer()[4*8+2]), 0, 0, "slice + clip hidden half");
expect((int)c.get_buffer()[4*8+6], (int)B, 0, "slice + clip visible half");
// OBB mask units must resolve against the image VIEWPORT (the SVG element
// bbox), not the letterboxed content rect: content sits on rows 1..2 and
// the mask covers y >= 1, so both content rows must be fully visible.
Canvas2D d(4, 4); d.clear(0);
Shape2D band; band.mt(0,0.25f).lt(1,0.25f).lt(1,1).lt(0,1).close();
Mask mk; mk.set_content_units(Mask::Units::ObjectBoundingBox).add_shape(band, Paint(W));
d.set_mask(&mk).image_smoothing_enabled(false)
.draw_pixels(img, 2, 1, 0, 0, 4, 4, ImageAlign::xMidYMid, ImageFit::Meet);
d.clear_mask();
expect(A(d.get_buffer()[1*4+0]), 255, 0, "meet + OBB mask row 1");
expect(A(d.get_buffer()[2*4+3]), 255, 0, "meet + OBB mask row 2");
}
// 13. alpha survives sampling (premultiplied internally, straight output)
{
const uint32_t img[4] = {R, TR, TR, TR};
Canvas2D n(4, 4); n.clear(0);
n.image_smoothing_enabled(false).draw_pixels(img, 2, 2, 0, 0, 4, 4);
expect(A(n.get_buffer()[0*4+0]), 255, 0, "nearest opaque px");
expect(A(n.get_buffer()[3*4+3]), 0, 0, "nearest transparent px");
Canvas2D c(4, 4); c.clear(0);
c.draw_pixels(img, 2, 2, 0, 0, 4, 4);
const uint32_t p = c.get_buffer()[2*4+2];
expect(A(p), 16, 3, "bilinear partial alpha");
expect(Rr(p), 255, 1, "bilinear straight RGB kept");
}
// 14. save/restore covers the smoothing state
{
Canvas2D c(2, 2);
expect(c.image_smoothing_enabled() ? 1 : 0, 1, 0, "default smoothing on");
expect((int)c.image_smoothing_quality(), (int)ImageSmoothingQuality::Low, 0, "default quality low");
c.save();
c.image_smoothing_enabled(false).image_smoothing_quality(ImageSmoothingQuality::High);
expect(c.imageSmoothingEnabled() ? 1 : 0, 0, 0, "smoothing set off");
expect((int)c.imageSmoothingQuality(), (int)ImageSmoothingQuality::High, 0, "quality set high");
c.restore();
expect(c.image_smoothing_enabled() ? 1 : 0, 1, 0, "restore smoothing");
expect((int)c.image_smoothing_quality(), (int)ImageSmoothingQuality::Low, 0, "restore quality");
}
// 15. negative viewport normalizes for PAR; legacy None keeps the flip
{
const uint32_t img[2] = {R, B};
Canvas2D a(4, 4), b(4, 4); a.clear(0); b.clear(0);
a.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 0, 0, 4, 4, ImageAlign::xMidYMid, ImageFit::Meet);
b.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 4, 4, -4, -4, ImageAlign::xMidYMid, ImageFit::Meet);
expect(std::memcmp(a.get_buffer(), b.get_buffer(), 4*4*4) == 0 ? 1 : 0, 1, 0, "negative viewport normalized");
Canvas2D f(4, 4); f.clear(0);
f.image_smoothing_enabled(false).draw_pixels(img, 2, 1, 4, 4, -4, -4);
expect((int)f.get_buffer()[1*4+0], (int)B, 0, "legacy negative w flips");
}
g_image_selftest_checks = checks;
std::printf("[image self-test] %u/%u checks passed\n", checks - fails, checks);
return fails;
}
ag_export(get_image_selftest_checks) uint32_t get_image_selftest_checks() { return g_image_selftest_checks; }
// ============================================================================
// TEST 9b - NUMERIC CAP / JOIN SELF-TEST (SVG 2 §2.1, incl. 'miter-clip')
// Deterministic, no font/image prefetch needed. Returns the failure count
// (0 = all pass), mirroring the image/mask/clip/composite self-tests.
//
// Reference geometry: a symmetric V with interior angle theta has its miter
// tip at (width/2) / sin(theta/2) from the apex, so
//   60deg -> 2.0 x r   (limit < 2 clips),  90deg -> 1.414 x r
// and 'miter-clip' cuts perpendicular to the bisector at limit * r.
// ============================================================================
static uint32_t g_capjoin_selftest_checks = 0;
static constexpr float CJ_D2R = 0.01745329251994329577f;
// Symmetric V: apex (cx,cy), interior angle deg, arm length len, rotated rot.
static Shape2D cj_v(float cx, float cy, float deg, float len, float rot,
float w, Shape2D::LineJoin join, float limit) {
const float h = deg * 0.5f * CJ_D2R, r = rot * CJ_D2R;
const float ax = std::sin(h) * len, ay = std::cos(h) * len;
const float cs = std::cos(r), sn = std::sin(r);
Shape2D s;
s.mt(cx - ax * cs - ay * sn, cy - ax * sn + ay * cs)
.lt(cx, cy)
.lt(cx + ax * cs - ay * sn, cy + ax * sn + ay * cs);
s.set_line_width(w).set_line_join(join).set_miter_limit(limit);
return s;
}
static void cj_draw(Canvas2D& c, const Shape2D& s) {
c.clear(0).fill_style(rgba(0,0,0,0)).stroke_style(rgba(255,255,255,255)).path(s);
}
static int cj_a(const Canvas2D& c, int x, int y) {
return (int)(c.get_buffer()[static_cast<size_t>(y) * c.get_width() + x] >> 24);
}
static int cj_count(const Canvas2D& c) {
int n = 0; const size_t sz = static_cast<size_t>(c.get_width()) * c.get_height();
for (size_t i = 0; i < sz; ++i) if (c.get_buffer()[i] >> 24) ++n;
return n;
}
// Furthest covered pixel centre projected on the unit vector (bx,by) from (ax,ay).
static float cj_extent(const Canvas2D& c, float ax, float ay, float bx, float by) {
float best = -1e30f;
for (int y = 0; y < c.get_height(); ++y)
for (int x = 0; x < c.get_width(); ++x)
if (cj_a(c, x, y) >= 128) {
const float d = (x + 0.5f - ax) * bx + (y + 0.5f - ay) * by;
if (d > best) best = d;
}
return best;
}
// Pixels where a is less opaque than b (1 LSB of rounding allowed).
static int cj_below(const Canvas2D& a, const Canvas2D& b) {
int n = 0; const size_t sz = static_cast<size_t>(a.get_width()) * a.get_height();
for (size_t i = 0; i < sz; ++i)
if ((a.get_buffer()[i] >> 24) + 1u < (b.get_buffer()[i] >> 24)) ++n;
return n;
}
static bool cj_same(const Canvas2D& a, const Canvas2D& b) {
const size_t n = static_cast<size_t>(a.get_width()) * a.get_height();
return a.get_width() == b.get_width() && a.get_height() == b.get_height() &&
std::memcmp(a.get_buffer(), b.get_buffer(), n * 4) == 0;
}
static bool cj_finite(const Shape2D& s) {
s.compile(64);
for (const auto& e : s.stroke_edges)
if (!std::isfinite(e.y_min) || !std::isfinite(e.y_max) ||
!std::isfinite(e.x_at_ymin) || !std::isfinite(e.inv_slope)) return false;
return true;
}
ag_export(run_capjoin_selftest)
uint32_t run_capjoin_selftest() {
uint32_t fails = 0, checks = 0;
auto expect = [&](int got, int want, int tol, const char* name) {
++checks;
if (got < want - tol || got > want + tol) {
++fails;
std::printf("[capjoin self-test] FAIL %s: got %d, want %d (+/-%d)\n", name, got, want, tol);
}
};
auto expectf = [&](float got, float want, float tol, const char* name) {
++checks;
if (!(got >= want - tol && got <= want + tol)) {
++fails;
std::printf("[capjoin self-test] FAIL %s: got %.2f, want %.2f (+/-%.2f)\n", name, got, want, tol);
}
};
const Shape2D::LineJoin MC = Shape2D::JOIN_MITER_CLIP, MI = Shape2D::JOIN_MITER,
BE = Shape2D::JOIN_BEVEL, RO = Shape2D::JOIN_ROUND;
// 1. enum / default
expect((int)Shape2D().line_join, (int)MI, 0, "default join is miter");
expect((int)MC, 3, 0, "miter-clip enum value");
// 2. 60deg V, width 20 (r=10): full tip 20px out, limit 1.5 -> cut at 15px
{
Canvas2D c(100,140), m(100,140), b(100,140);
cj_draw(c, cj_v(50,100,60,40,0,20,MC,1.5f));
cj_draw(m, cj_v(50,100,60,40,0,20,MI,1.5f));
cj_draw(b, cj_v(50,100,60,40,0,20,BE,1.5f));
expect(cj_a(c,50,85), 255, 1, "clip keeps the miter up to the limit");
expect(cj_a(c,50,84), 0, 0, "clip cut at the limit distance");
expect(cj_a(c,50,87), 255, 1, "clip miter body");
expect(cj_a(c,50,80), 0, 0, "clip removes the spike tip");
expect(cj_a(c,50,100), 255, 0, "clip apex solid");
expect(cj_a(c,50,110), 255, 0, "clip body solid");
expect(cj_a(m,50,85), 0, 0, "miter falls back to bevel");
expect(cj_same(m,b) ? 1 : 0, 1, 0, "miter fallback == bevel");
expect(cj_same(c,b) ? 1 : 0, 0, 0, "miter-clip != bevel");
int flat = 1; for (int x = 40; x <= 60; ++x) if (cj_a(c,x,84)) flat = 0;
expect(flat, 1, 0, "cut face is flat");
expect(cj_a(c,46,85), cj_a(c,53,85), 0, "cut face symmetric (outer)");
expect(cj_a(c,47,85), cj_a(c,52,85), 0, "cut face symmetric (inner)");
expect(cj_a(c,46,85) > 0 ? 1 : 0, 1, 0, "cut face edge anti-aliased");
expect(cj_a(c,49,85), 255, 0, "cut face centre opaque");
}
// 3. cut distance == limit * width / 2, growing with the limit
{
float prev = -1e30f;
const float lims[5] = {1.0f, 1.2f, 1.4f, 1.6f, 1.8f};
for (int i = 0; i < 5; ++i) {
Canvas2D c(100,140);
cj_draw(c, cj_v(50,100,60,40,0,20,MC,lims[i]));
const float e = cj_extent(c, 50, 100, 0, -1);
expectf(e, lims[i] * 10.0f, 1.0f, "cut distance == limit * width/2");
expect(e >= prev - 0.01f ? 1 : 0, 1, 0, "cut distance grows with the limit");
prev = e;
}
}
// 4. limit not exceeded -> byte-identical to plain miter
{
const float lims[3] = {2.5f, 4.0f, 10.0f};
for (int i = 0; i < 3; ++i) {
Canvas2D a(100,140), b(100,140);
cj_draw(a, cj_v(50,100,60,40,0,20,MC,lims[i]));
cj_draw(b, cj_v(50,100,60,40,0,20,MI,lims[i]));
expect(cj_same(a,b) ? 1 : 0, 1, 0, "unclipped miter-clip == miter");
}
}
// 5. bevel <= miter-clip <= unclipped miter (no holes, no overshoot)
{
const float degs[4] = {20, 60, 90, 120};
const float lims[3] = {1.0f, 1.5f, 3.0f};
for (int i = 0; i < 4; ++i) for (int j = 0; j < 3; ++j) {
Canvas2D c(100,160), b(100,160), f(100,160);
cj_draw(c, cj_v(50,110,degs[i],40,0,20,MC,lims[j]));
cj_draw(b, cj_v(50,110,degs[i],40,0,20,BE,lims[j]));
cj_draw(f, cj_v(50,110,degs[i],40,0,20,MI,1e6f));
expect(cj_below(c,b), 0, 0, "miter-clip covers the bevel");
expect(cj_below(f,c), 0, 0, "miter-clip stays inside the full miter");
}
}
// 6. right angle (ratio sqrt(2)): limit 1.2 cuts at 12, bevel corner sits at 7.07
{
Canvas2D c(100,140), m(100,140);
cj_draw(c, cj_v(50,100,90,40,0,20,MC,1.2f));
cj_draw(m, cj_v(50,100,90,40,0,20,MI,1.2f));
expectf(cj_extent(c,50,100,0,-1), 12.0f, 1.0f, "right-angle clip distance");
expectf(cj_extent(m,50,100,0,-1), 7.07f, 1.0f, "right-angle bevel distance");
expect(cj_same(c,m) ? 1 : 0, 0, 0, "right-angle clip != bevel");
}
// 7. asymmetric join: the cut is perpendicular to the true bisector
{
Shape2D s; s.mt(10,120).lt(50,100).lt(60,145);
s.set_line_width(20).set_line_join(MC).set_miter_limit(1.2f);
Canvas2D c(100,160); cj_draw(c, s);
float d1x = -40, d1y = 20, d2x = 10, d2y = 45;
const float l1 = std::sqrt(d1x*d1x + d1y*d1y), l2 = std::sqrt(d2x*d2x + d2y*d2y);
d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
float bx = -(d1x + d2x), by = -(d1y + d2y);
const float bl = std::sqrt(bx*bx + by*by); bx /= bl; by /= bl;
expectf(cj_extent(c,50,100,bx,by), 12.0f, 1.0f, "asymmetric bisector cut");
}
// 8. rotated join
{
Canvas2D c(140,140);
cj_draw(c, cj_v(70,70,60,40,37,20,MC,1.8f));
expectf(cj_extent(c,70,70,-std::sin(37*CJ_D2R),-std::cos(37*CJ_D2R)), 18.0f, 1.0f, "rotated bisector cut");
}
// 9. closed triangle: every corner is clipped at limit * r
{
const float cx = 60, cy = 70, R = 40; float vx[3], vy[3]; Shape2D s;
for (int i = 0; i < 3; ++i) {
const float a = (-90 + i * 120) * CJ_D2R;
vx[i] = cx + R * std::cos(a); vy[i] = cy + R * std::sin(a);
}
s.mt(vx[0],vy[0]).lt(vx[1],vy[1]).lt(vx[2],vy[2]).close();
s.set_line_width(16).set_line_join(MC).set_miter_limit(1.0f);
Canvas2D c(120,140), b(120,140); cj_draw(c, s);
Shape2D q = s; q.set_line_join(BE); cj_draw(b, q);
for (int i = 0; i < 3; ++i)
expectf(cj_extent(c,vx[i],vy[i],(vx[i]-cx)/R,(vy[i]-cy)/R), 8.0f, 1.0f, "closed corner clip distance");
expect(cj_below(c,b), 0, 0, "closed clip covers the bevel");
}
// 10. star tips
{
const float cx = 70, cy = 80, ro = 55, ri = 22; Shape2D s;
for (int i = 0; i < 5; ++i) {
const float ao = (i * 72 - 90) * CJ_D2R, ai = ((i * 72) + 36 - 90) * CJ_D2R;
if (i == 0) s.mt(cx + ro*std::cos(ao), cy + ro*std::sin(ao));
else s.lt(cx + ro*std::cos(ao), cy + ro*std::sin(ao));
s.lt(cx + ri*std::cos(ai), cy + ri*std::sin(ai));
}
s.close().set_line_width(7).set_line_join(MC).set_miter_limit(2.0f);
Canvas2D c(140,160), m(140,160); cj_draw(c, s);
Shape2D q = s; q.set_line_join(MI); cj_draw(m, q);
expectf(cj_extent(c,cx,cy-ro,0,-1), 7.0f, 1.0f, "star tip clip distance");
expect(cj_same(c,m) ? 1 : 0, 0, 0, "star clip != miter");
}
// 11. dashes keep the clipped join inside a dash
{
Shape2D s = cj_v(50,100,60,40,0,20,MC,1.5f); s.set_dash_array({50,10});
Shape2D q = cj_v(50,100,60,40,0,20,MI,1.5f); q.set_dash_array({50,10});
Canvas2D c(100,140), m(100,140); cj_draw(c, s); cj_draw(m, q);
expect(cj_a(c,50,85), 255, 1, "dashed clipped join kept");
expect(cj_a(c,50,84), 0, 0, "dashed clipped join cut");
expect(cj_a(m,50,85), 0, 0, "dashed miter bevel");
}
// 12. degenerate / invalid input stays safe
{
Shape2D u; u.mt(20,100).lt(50,100).lt(20,100);
u.set_line_width(20).set_line_join(MC).set_miter_limit(1.0f);
Canvas2D c(100,140); cj_draw(c, u);
expect(cj_count(c) > 0 ? 1 : 0, 1, 0, "u-turn renders");
expect(cj_finite(u) ? 1 : 0, 1, 0, "u-turn geometry finite");
Shape2D co; co.mt(20,100).lt(50,100).lt(80,100);
co.set_line_width(20).set_line_join(MC).set_miter_limit(1.0f);
Shape2D li; li.mt(20,100).lt(80,100);
li.set_line_width(20).set_line_join(MC).set_miter_limit(1.0f);
Canvas2D a(100,140), b(100,140); cj_draw(a, co); cj_draw(b, li);
expect(cj_same(a,b) ? 1 : 0, 1, 0, "collinear join == straight line");
Canvas2D p(100,140), q(100,140), r(100,140);
cj_draw(p, cj_v(50,100,60,40,0,20,MC,0.25f));
cj_draw(q, cj_v(50,100,60,40,0,20,MC,1.0f));
cj_draw(r, cj_v(50,100,60,40,0,20,MC,std::numeric_limits<float>::quiet_NaN()));
expect(cj_same(p,q) ? 1 : 0, 1, 0, "limit < 1 clamped to 1");
expect(cj_same(r,q) ? 1 : 0, 1, 0, "NaN limit clamped to 1");
Canvas2D h1(100,140), h2(100,140);
cj_draw(h1, cj_v(50,100,60,40,0,20,MC,1e6f));
cj_draw(h2, cj_v(50,100,60,40,0,20,MI,1e6f));
expect(cj_same(h1,h2) ? 1 : 0, 1, 0, "huge limit == miter");
Shape2D tiny = cj_v(50,100,60,40,0,0.05f,MC,1.0f);
Canvas2D z(100,140); cj_draw(z, tiny);
expect(cj_finite(tiny) ? 1 : 0, 1, 0, "hairline geometry finite");
}
// 13. set_line_join / set_miter_limit invalidate the compiled cache
{
Shape2D s = cj_v(50,100,60,40,0,20,MI,4.0f);
Canvas2D a(100,140); cj_draw(a, s);
s.set_line_join(MC).set_miter_limit(1.5f);
Canvas2D b(100,140), c(100,140); cj_draw(b, s);
cj_draw(c, cj_v(50,100,60,40,0,20,MC,1.5f));
expect(cj_same(b,c) ? 1 : 0, 1, 0, "join switch recompiles");
expect(cj_same(a,b) ? 1 : 0, 0, 0, "join switch changes the output");
}
// 14. the cut follows the CTM
{
Canvas2D a(100,140), b(100,140);
a.save(); a.scale(2,2);
cj_draw(a, cj_v(25,50,60,20,0,10,MC,1.5f));
a.restore();
cj_draw(b, cj_v(50,100,60,40,0,20,MC,1.5f));
expect(cj_same(a,b) ? 1 : 0, 1, 0, "CTM scale 2 == pre-scaled geometry");
}
// 15. globalAlpha / clip-path / gradient still apply to the clipped join
{
Canvas2D c(100,140); c.global_alpha(0.5f);
cj_draw(c, cj_v(50,100,60,40,0,20,MC,1.5f));
expect(cj_a(c,50,86), 128, 1, "globalAlpha on the clipped join");
expect(cj_a(c,50,84), 0, 0, "globalAlpha keeps the cut");
}
{
Shape2D win; win.mt(0,90).lt(100,90).lt(100,140).lt(0,140).close();
ClipPath cp; cp.add(win);
Canvas2D c(100,140); c.set_clip(&cp);
cj_draw(c, cj_v(50,100,60,40,0,20,MC,1.5f));
c.clear_clip();
expect(cj_a(c,50,86), 0, 0, "clip-path removes the clipped spike");
expect(cj_a(c,50,95), 255, 0, "clip-path keeps the body");
}
{
LinearGradient* lg = new LinearGradient(20,0,80,0);
lg->add_stop(0, rgba(255,0,0,255)).add_stop(1, rgba(0,0,255,255));
Canvas2D c(100,140);
c.clear(0).fill_style(rgba(0,0,0,0)).stroke_style(lg).path(cj_v(50,100,60,40,0,20,MC,1.5f));
expect(cj_a(c,50,86), 255, 0, "gradient on the clipped join");
expect(cj_a(c,50,84), 0, 0, "gradient keeps the cut");
const uint32_t l = c.get_buffer()[95*100+44], r = c.get_buffer()[95*100+56];
expect((int)(l & 255) > (int)(r & 255) ? 1 : 0, 1, 0, "gradient paints the join");
delete lg;
}
// 16. round / bevel regression
{
Canvas2D r(100,140), b(100,140);
cj_draw(r, cj_v(50,100,60,40,0,20,RO,1.5f));
cj_draw(b, cj_v(50,100,60,40,0,20,BE,1.5f));
expectf(cj_extent(r,50,100,0,-1), 10.0f, 1.0f, "round join radius");
expectf(cj_extent(b,50,100,0,-1), 5.0f, 1.0f, "bevel join chord");
}
g_capjoin_selftest_checks = checks;
std::printf("[capjoin self-test] %u/%u checks passed\n", checks - fails, checks);
return fails;
}
ag_export(get_capjoin_selftest_checks) uint32_t get_capjoin_selftest_checks() { return g_capjoin_selftest_checks; }
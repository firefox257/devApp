// ./canvas_test_svg.hpp
// Tests 16-17: SVG 2 masking & clipping demos + numeric self-tests.
// INCLUDED by canvas_test.cpp (single translation unit) - not standalone.
// Relies on the entry file for includes and shared globals (g_mask_canvas,
// g_clip_canvas, g_font, g_prefetched_*). Must be included AFTER
// canvas_test_demos.hpp is not required, but keep entry-file order stable.
// Updated in place: the lens clip is now built from SVG elliptical arcs (A/a),
// and the self-tests include numeric checks for the normalized SVG commands
// (H/h, V/v, S/s, T/t, A/a) used as mask / clip geometry.
#pragma once
// ============================================================================
// TEST 16 SUPPORT - SVG 2 MASKING (mask-type: luminance | alpha)
// Masks / paint servers are heap objects (shared AtomicMalloc heap) and pooled
// so every temporary is explicitly freed when the test finishes.
// ============================================================================
static std::vector<Mask*> g_mask_pool;
static std::vector<Gradient*> g_mask_paint_pool;
static Canvas2D* g_mask_src_canvas = nullptr;
static uint32_t g_mask_selftest_checks = 0;
static void mask_pool_reset() {
	for (Mask* m : g_mask_pool) delete m;
	g_mask_pool.clear();
	for (Gradient* g : g_mask_paint_pool) delete g;
	g_mask_paint_pool.clear();
}
static Mask* mk_mask() { Mask* m = new Mask(); g_mask_pool.push_back(m); return m; }
static LinearGradient* mk_lin(float x1, float y1, float x2, float y2) {
	LinearGradient* g = new LinearGradient(x1, y1, x2, y2); g_mask_paint_pool.push_back(g); return g;
}
static RadialGradient* mk_rad(float cx, float cy, float r) {
	RadialGradient* g = new RadialGradient(cx, cy, r, cx, cy); g_mask_paint_pool.push_back(g); return g;
}
static Shape2D mask_box(float x, float y, float w, float h) {
	Shape2D s; s.mt(x, y).lt(x + w, y).lt(x + w, y + h).lt(x, y + h).close(); return s;
}
static Shape2D mask_disc(float cx, float cy, float r) {
	Shape2D s; s.mt(cx + r, cy).at(cx, cy, r, 0, 6.2831853f, false).close(); return s;
}
static Shape2D mask_star(float cx, float cy, float ro, float ri) {
	Shape2D s;
	for (int i = 0; i < 5; ++i) {
		float ao = (i * 72 - 90) * 3.14159265f / 180.0f, ai = ((i * 72) + 36 - 90) * 3.14159265f / 180.0f;
		if (i == 0) s.mt(cx + ro * std::cos(ao), cy + ro * std::sin(ao));
		else s.lt(cx + ro * std::cos(ao), cy + ro * std::sin(ao));
		s.lt(cx + ri * std::cos(ai), cy + ri * std::sin(ai));
	}
	s.close(); return s;
}
ag_export(run_mask_demo)
uint32_t run_mask_demo(uint32_t width, uint32_t height) {
	if (width == 0 || height == 0) { width = 700; height = 1120; }
	if (g_mask_canvas) delete g_mask_canvas;
	g_mask_canvas = new Canvas2D(width, height);
	Canvas2D& c = *g_mask_canvas;
	mask_pool_reset();
	const float s = std::min(width / 700.0f, height / 1120.0f);
	const uint32_t bg = rgba(24,28,36,255), tr = rgba(0,0,0,0), guide = rgba(90,90,110,90);
	const uint32_t dim = rgba(175,180,195,255), head = rgba(120,200,255,255), white = rgba(255,255,255,255);
	const float TW = 200.0f, TH = 90.0f, CX[3] = {30.0f, 250.0f, 470.0f};
	c.clear(bg);
	c.save();
	c.scale(s, s);
	c.fill_style(tr).stroke_style(guide);
	for (int gx = 0; gx <= 700; gx += 50) { Shape2D p; p.mt(gx,0).lt(gx,1120).set_line_width(0.5f); c.path(p); }
	for (int gy = 0; gy <= 1120; gy += 50) { Shape2D p; p.mt(0,gy).lt(700,gy).set_line_width(0.5f); c.path(p); }
	auto label = [&](const char* txt, float x, float y, float px, uint32_t col) {
		if (!g_font) return;
		g_font->set_pixel_height(px);
		c.font(g_font).fill_style(col).stroke_style(tr).fill_text(txt, x, y);
	};
	auto section = [&](const char* txt, float y) { label(txt, 30, y, 26, head); };
	// Checkerboard behind each tile so masked-out areas are obvious.
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
	// ---- 1. mask-type: luminance (SVG 2 default) ----
	section("1. mask-type: luminance (SVG 2 default)", 34);
	{
		const float y = 48;
		checker(CX[0], y, TW, TH);
		Shape2D r = mask_box(CX[0], y, TW, TH);
		LinearGradient* g = mk_lin(CX[0], y, CX[0] + TW, y);
		g->add_stop(0, rgba(0,0,0,255)).add_stop(1, white);
		Mask* m = mk_mask();
		m->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[0], y, TW, TH).add_shape(r, Paint(g));
		c.set_mask(m).fill_style(rgba(255,90,110,255)).stroke_style(tr).path(r);
		c.clear_mask();
		label("linear ramp", CX[0], y + TH + 20, 19, dim);
		checker(CX[1], y, TW, TH);
		Shape2D r2 = mask_box(CX[1], y, TW, TH);
		RadialGradient* rg = mk_rad(CX[1] + TW * 0.5f, y + TH * 0.5f, TH * 0.62f);
		rg->add_stop(0, white).add_stop(0.55f, rgba(150,150,150,255)).add_stop(1, rgba(0,0,0,255));
		Mask* m2 = mk_mask();
		m2->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[1], y, TW, TH).add_shape(r2, Paint(rg));
		c.set_mask(m2).fill_style(rainbow(CX[1], y, TW)).stroke_style(tr).path(r2);
		c.clear_mask();
		label("radial spotlight", CX[1], y + TH + 20, 19, dim);
		checker(CX[2], y, TW, TH);
		Shape2D r3 = mask_box(CX[2], y, TW, TH);
		Shape2D bgb = mask_box(CX[2], y, TW, TH);
		Shape2D dc = mask_disc(CX[2] + 60, y + 45, 34);
		Shape2D grey = mask_box(CX[2] + 105, y + 18, 76, 54);
		Mask* m3 = mk_mask();
		m3->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[2], y, TW, TH)
		.add_shape(bgb, Paint(rgba(0,0,0,255)))
		.add_shape(dc, Paint(white))
		.add_shape(grey, Paint(rgba(128,128,128,255)));
		c.set_mask(m3).fill_style(rgba(120,255,190,255)).stroke_style(tr).path(r3);
		c.clear_mask();
		label("mask children", CX[2], y + TH + 20, 19, dim);
	}
	// ---- 2. mask-type: alpha ----
	section("2. mask-type: alpha (mask-mode: alpha)", 190);
	{
		const float y = 204;
		checker(CX[0], y, TW, TH);
		Shape2D r = mask_box(CX[0], y, TW, TH);
		LinearGradient* g = mk_lin(CX[0], y, CX[0] + TW, y);
		g->add_stop(0, rgba(0,0,0,255)).add_stop(1, white);
		Mask* m = mk_mask();
		m->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(CX[0], y, TW, TH).add_shape(r, Paint(g));
		c.set_mask(m).fill_style(rgba(255,90,110,255)).stroke_style(tr).path(r);
		c.clear_mask();
		label("colour ignored", CX[0], y + TH + 20, 19, dim);
		checker(CX[1], y, TW, TH);
		Shape2D r2 = mask_box(CX[1], y, TW, TH);
		LinearGradient* g2 = mk_lin(CX[1], y, CX[1] + TW, y);
		g2->add_stop(0, rgba(255,255,255,0)).add_stop(1, rgba(255,255,255,255));
		Mask* m2 = mk_mask();
		m2->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(CX[1], y, TW, TH).add_shape(r2, Paint(g2));
		c.set_mask(m2).fill_style(rainbow(CX[1], y, TW)).stroke_style(tr).path(r2);
		c.clear_mask();
		label("alpha ramp", CX[1], y + TH + 20, 19, dim);
		checker(CX[2], y, TW, TH);
		Shape2D r3 = mask_box(CX[2], y, TW, TH);
		Shape2D d1 = mask_disc(CX[2] + 70, y + 45, 40), d2 = mask_disc(CX[2] + 130, y + 45, 40);
		Mask* m3 = mk_mask();
		m3->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(CX[2], y, TW, TH)
		.add_shape(d1, Paint(rgba(255,255,255,90)))
		.add_shape(d2, Paint(rgba(255,255,255,170)));
		c.set_mask(m3).fill_style(rgba(190,120,255,255)).stroke_style(tr).path(r3);
		c.clear_mask();
		label("alpha union", CX[2], y + TH + 20, 19, dim);
	}
	// ---- 3. luminance colour space: sRGB vs linearRGB vs alpha ----
	section("3. luminance: sRGB / linearRGB / alpha", 346);
	{
		const float y = 360;
		for (int i = 0; i < 3; ++i) {
			const float x = CX[i];
			checker(x, y, TW, TH);
			Shape2D r = mask_box(x, y, TW, TH);
			Shape2D b1 = mask_box(x, y, TW / 3.0f, TH);
			Shape2D b2 = mask_box(x + TW / 3.0f, y, TW / 3.0f, TH);
			Shape2D b3 = mask_box(x + 2.0f * TW / 3.0f, y, TW / 3.0f + 0.5f, TH);
			Mask* m = mk_mask();
			m->set_units(Mask::Units::UserSpaceOnUse).set_region(x, y, TW, TH)
			.add_shape(b1, Paint(rgba(255,0,0,255)))
			.add_shape(b2, Paint(rgba(0,255,0,255)))
			.add_shape(b3, Paint(rgba(0,0,255,255)));
			if (i == 1) m->set_color_space(Mask::ColorSpace::LinearRGB);
			if (i == 2) m->set_type(Mask::Type::Alpha);
			c.set_mask(m).fill_style(white).stroke_style(tr).path(r);
			c.clear_mask();
		}
		label("sRGB 54/183/18", CX[0], y + TH + 20, 19, dim);
		label("linearRGB", CX[1], y + TH + 20, 19, dim);
		label("alpha = 255", CX[2], y + TH + 20, 19, dim);
	}
	// ---- 4. maskContentUnits = objectBoundingBox ----
	section("4. maskContentUnits = objectBoundingBox", 502);
	{
		const float y = 516;
		Shape2D unit = mask_box(0, 0, 1, 1);
		LinearGradient* ug = mk_lin(0, 0, 1, 0);
		ug->add_stop(0, rgba(0,0,0,255)).add_stop(1, white);
		Mask* om = mk_mask();                    // maskUnits defaults to OBB (-10% .. 120%)
		om->set_content_units(Mask::Units::ObjectBoundingBox).add_shape(unit, Paint(ug));
		Shape2D r = mask_box(CX[0], y, TW, TH);
		Shape2D d = mask_disc(CX[1] + TW * 0.5f, y + TH * 0.5f, TH * 0.5f);
		Shape2D st = mask_star(CX[2] + TW * 0.5f, y + TH * 0.5f, TH * 0.55f, TH * 0.24f);
		checker(CX[0], y, TW, TH); checker(CX[1], y, TW, TH); checker(CX[2], y, TW, TH);
		c.set_mask(om).stroke_style(tr);
		c.fill_style(rgba(255,140,60,255)).path(r);
		c.fill_style(rgba(90,220,255,255)).path(d);
		c.fill_style(rgba(190,120,255,255)).path(st);
		c.clear_mask();
		label("one unit mask, three bounding boxes", CX[0], y + TH + 20, 19, dim);
	}
	// ---- 5. mask region & mask transform ----
	section("5. mask region (x/y/width/height) & transform", 658);
	{
		const float y = 672;
		checker(CX[0], y, TW, TH);
		Shape2D r = mask_box(CX[0], y, TW, TH);
		Shape2D full = mask_box(CX[0] - 20, y - 20, TW + 40, TH + 40);
		Mask* m = mk_mask();
		m->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[0] + 45, y + 20, TW - 90, TH - 40).add_shape(full, Paint(white));
		c.set_mask(m).fill_style(rainbow(CX[0], y, TW)).stroke_style(tr).path(r);
		c.clear_mask();
		label("region clip", CX[0], y + TH + 20, 19, dim);
		checker(CX[1], y, TW, TH);
		Shape2D r2 = mask_box(CX[1], y, TW, TH);
		std::vector<Shape2D> bars; bars.reserve(10);
		for (int i = 0; i < 8; ++i) bars.push_back(mask_box(CX[1] - 40 + i * 34.0f, y - 40, 17.0f, TH + 80));
		Mask* m2 = mk_mask();
		m2->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[1], y, TW, TH);
		for (const Shape2D& b : bars) m2->add_shape(b, Paint(white));
		Transform rt;
		rt.translate(CX[1] + TW * 0.5f, y + TH * 0.5f); rt.rotate(0.5f); rt.translate(-(CX[1] + TW * 0.5f), -(y + TH * 0.5f));
		m2->transform() = rt;
		c.set_mask(m2).fill_style(rgba(255,210,90,255)).stroke_style(tr).path(r2);
		c.clear_mask();
		label("transform rotate", CX[1], y + TH + 20, 19, dim);
		checker(CX[2], y, TW, TH);
		Shape2D r3 = mask_box(CX[2], y, TW, TH);
		Shape2D dc = mask_disc(CX[2] + TW * 0.5f, y + TH * 0.5f, 30.0f);
		Mask* m3 = mk_mask();
		m3->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[2], y, TW, TH).add_shape(dc, Paint(white));
		Transform st2;
		st2.translate(CX[2] + TW * 0.5f, y + TH * 0.5f); st2.scale(2.6f, 1.1f); st2.translate(-(CX[2] + TW * 0.5f), -(y + TH * 0.5f));
		m3->transform() = st2;
		c.set_mask(m3).fill_style(rgba(120,255,170,255)).stroke_style(tr).path(r3);
		c.clear_mask();
		label("transform scale", CX[2], y + TH + 20, 19, dim);
	}
	// ---- 6. masked strokes / dashes / shadow / blend ----
	section("6. masked strokes / dashes / shadow / blend", 814);
	{
		const float y = 828;
		checker(CX[0], y, TW, TH);
		Shape2D line; line.mt(CX[0] + 14, y + TH * 0.5f).lt(CX[0] + TW - 14, y + TH * 0.5f)
		.set_line_width(20).set_line_cap(Shape2D::CAP_ROUND).set_dash_array({22,12});
		Shape2D r = mask_box(CX[0], y, TW, TH);
		LinearGradient* g = mk_lin(CX[0], y, CX[0] + TW, y);
		g->add_stop(0, rgba(0,0,0,255)).add_stop(1, white);
		Mask* m = mk_mask();
		m->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[0], y, TW, TH).add_shape(r, Paint(g));
		c.set_mask(m).fill_style(tr).stroke_style(rgba(255,120,200,255)).path(line);
		c.clear_mask();
		label("dashed stroke", CX[0], y + TH + 20, 19, dim);
		checker(CX[1], y, TW, TH);
		Shape2D shp = mask_star(CX[1] + TW * 0.5f, y + TH * 0.5f, 40.0f, 18.0f);
		shp.set_line_width(6).set_line_join(Shape2D::JOIN_ROUND);
		Shape2D r2 = mask_box(CX[1], y, TW, TH);
		RadialGradient* rg = mk_rad(CX[1] + TW * 0.5f, y + TH * 0.5f, TH * 0.7f);
		rg->add_stop(0, white).add_stop(1, rgba(0,0,0,255));
		Mask* m2 = mk_mask();
		m2->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[1], y, TW, TH).add_shape(r2, Paint(rg));
		c.set_mask(m2).drop_shadow(5, 5, 3, rgba(0,0,0,230))
		.fill_style(rgba(255,230,120,255)).stroke_style(rgba(255,120,60,255)).path(shp);
		c.clear_shadow().clear_mask();
		label("fill+stroke+shadow", CX[1], y + TH + 20, 19, dim);
		checker(CX[2], y, TW, TH);
		Shape2D base = mask_box(CX[2] + 10, y + 10, TW - 20, TH - 20);
		c.fill_style(rgba(40,90,180,255)).stroke_style(tr).path(base);
		Shape2D r3 = mask_box(CX[2], y, TW, TH);
		LinearGradient* g3 = mk_lin(CX[2], y + TH, CX[2], y);
		g3->add_stop(0, rgba(0,0,0,255)).add_stop(1, white);
		Mask* m3 = mk_mask();
		m3->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[2], y, TW, TH).add_shape(r3, Paint(g3));
		c.save();
		c.set_mask(m3).blend_mode(BlendMode::Screen).fill_style(rgba(255,140,40,255)).stroke_style(tr).path(base);
		c.restore();                                   // pops mask AND blend mode
		Shape2D mark = mask_box(CX[2] + TW - 26, y + TH - 22, 16, 12);
		c.fill_style(white).stroke_style(tr).path(mark);   // unmasked proof
		label("screen + save/restore", CX[2], y + TH + 20, 19, dim);
	}
	// ---- 7. masked text / image / canvas-as-mask ----
	section("7. text / image / canvas-as-mask (match-source)", 970);
	{
		const float y = 984;
		checker(CX[0], y, TW, TH);
		Shape2D r = mask_box(CX[0], y, TW, TH);
		LinearGradient* g = mk_lin(CX[0], y, CX[0] + TW, y);
		g->add_stop(0, rgba(0,0,0,255)).add_stop(0.5f, white).add_stop(1, rgba(0,0,0,255));
		Mask* m = mk_mask();
		m->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[0], y, TW, TH).add_shape(r, Paint(g));
		c.set_mask(m);
		if (g_font) {
			g_font->set_pixel_height(54);
			c.font(g_font).fill_style(rgba(255,220,120,255)).stroke_style(tr).fill_text("MASK", CX[0] + 12, y + 58);
			g_font->set_pixel_height(26);
			c.set_line_dash({8,5});
			c.stroke_style(rgba(120,255,220,255)).stroke_text("SVG 2", CX[0] + 12, y + 84);
			c.set_line_dash({});
		} else {
			Shape2D fb = mask_box(CX[0] + 20, y + 25, TW - 40, TH - 50);
			c.fill_style(rgba(255,220,120,255)).stroke_style(tr).path(fb);
		}
		c.clear_mask();
		label(g_font ? "fill_text + stroke_text" : "run Font Test first", CX[0], y + TH + 20, 19, dim);
		checker(CX[1], y, TW, TH);
		Shape2D r2 = mask_box(CX[1], y, TW, TH);
		RadialGradient* rg2 = mk_rad(CX[1] + TW * 0.5f, y + TH * 0.5f, TW * 0.5f);
		rg2->add_stop(0, white).add_stop(0.7f, rgba(120,120,120,255)).add_stop(1, rgba(0,0,0,255));
		Mask* m2 = mk_mask();
		m2->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[1], y, TW, TH).add_shape(r2, Paint(rg2));
		bool drew_img = false;
		if (g_prefetched_image_data && g_prefetched_image_size > 0) {
			Image img;
			if (img.loadFromMemory(g_prefetched_image_data, (int)g_prefetched_image_size, 0)) {
				c.set_mask(m2).draw_image(img, CX[1], y, TW, TH);
				c.clear_mask();
				drew_img = true;
			}
		}
		if (!drew_img) {
			c.set_mask(m2).fill_style(rainbow(CX[1], y, TW)).stroke_style(tr).path(r2);
			c.clear_mask();
		}
		label(drew_img ? "draw_image" : "prefetch an image first", CX[1], y + TH + 20, 19, dim);
		checker(CX[2], y, TW, TH);
		const int sw = std::max(1, (int)std::lround(TW * s)), sh = std::max(1, (int)std::lround(TH * s));
		if (g_mask_src_canvas) delete g_mask_src_canvas;
		g_mask_src_canvas = new Canvas2D(sw, sh);
		{
			Canvas2D& src = *g_mask_src_canvas;
			src.clear(0);
			src.save(); src.scale(s, s);
			Shape2D sd = mask_disc(60, 45, 34);
			Shape2D sb = mask_box(110, 16, 74, 58);
			src.fill_style(white).stroke_style(tr).path(sd);
			src.fill_style(rgba(255,255,255,110)).stroke_style(tr).path(sb);
			src.restore();
		}
		Shape2D r3 = mask_box(CX[2], y, TW, TH);
		Mask* m3 = mk_mask();
		m3->set_type(Mask::Type::MatchSource).set_units(Mask::Units::UserSpaceOnUse).set_region(CX[2], y, TW, TH)
		.add(*g_mask_src_canvas, CX[2], y, TW, TH);
		c.set_mask(m3).fill_style(rainbow(CX[2], y, TW)).stroke_style(tr).path(r3);
		c.clear_mask();
		label("canvas as mask", CX[2], y + TH + 20, 19, dim);
	}
	c.restore();
	c.clear_mask().fill_style(tr).stroke_style(tr);
	mask_pool_reset();
	return 1;
}
// ============================================================================
// TEST 16b - NUMERIC MASK SELF-TEST (returns the failure count, 0 = all pass)
// ============================================================================
ag_export(run_mask_selftest)
uint32_t run_mask_selftest() {
	mask_pool_reset();
	uint32_t fails = 0, checks = 0;
	const uint32_t tr = rgba(0,0,0,0), white = rgba(255,255,255,255);
	auto alpha_of = [](uint32_t v) { return (int)(v >> 24); };
	auto expect = [&](int got, int want, int tol, const char* name) {
		++checks;
		if (got < want - tol || got > want + tol) {
			++fails;
			std::printf("[mask self-test] FAIL %s: got %d, want %d (+/-%d)\n", name, got, want, tol);
		}
	};
	// 1. alpha masking modulates opacity only; straight RGB is preserved
	{
		Canvas2D c(100, 50); c.clear(0);
		Shape2D b = mask_box(0,0,100,50), half = mask_box(0,0,50,50);
		Mask* m = mk_mask();
		m->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,100,50)
		.add_shape(half, Paint(rgba(255,255,255,128)));
		c.set_mask(m).fill_style(rgba(255,0,0,255)).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[25*100+25]), 128, 1, "alpha 128");
		expect(alpha_of(c.get_buffer()[25*100+75]), 0, 0, "alpha uncovered");
		expect((int)(c.get_buffer()[25*100+25] & 255), 255, 0, "straight RGB preserved");
	}
	// 2. luminance ramp black -> white
	{
		Canvas2D c(101, 10); c.clear(0);
		Shape2D b = mask_box(0,0,101,10);
		LinearGradient* g = mk_lin(0,0,100,0);
		g->add_stop(0, rgba(0,0,0,255)).add_stop(1, white);
		Mask* m = mk_mask();
		m->set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,101,10).add_shape(b, Paint(g));
		c.set_mask(m).fill_style(rgba(0,0,255,255)).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[5*101+0]), 0, 2, "luminance black end");
		expect(alpha_of(c.get_buffer()[5*101+50]), 129, 3, "luminance mid");
		expect(alpha_of(c.get_buffer()[5*101+100]), 255, 0, "luminance white end");
	}
	// 3. sRGB vs linearRGB luminance vs alpha on a pure red mask
	{
		Shape2D b = mask_box(0,0,20,20);
		Mask* ml = mk_mask();
		ml->set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,20,20).add_shape(b, Paint(rgba(255,0,0,255)));
		Canvas2D a(20,20); a.clear(0);
		a.set_mask(ml).fill_style(rgba(0,255,0,255)).stroke_style(tr).path(b);
		expect(alpha_of(a.get_buffer()[10*20+10]), 54, 1, "sRGB luminance of red");
		Mask* ma = mk_mask();
		ma->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,20,20).add_shape(b, Paint(rgba(255,0,0,255)));
		Canvas2D d(20,20); d.clear(0);
		d.set_mask(ma).fill_style(rgba(0,255,0,255)).stroke_style(tr).path(b);
		expect(alpha_of(d.get_buffer()[10*20+10]), 255, 0, "alpha ignores colour");
		Mask* mr = mk_mask();
		mr->set_color_space(Mask::ColorSpace::LinearRGB).set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,20,20).add_shape(b, Paint(rgba(255,0,0,255)));
		Canvas2D e(20,20); e.clear(0);
		e.set_mask(mr).fill_style(rgba(0,255,0,255)).stroke_style(tr).path(b);
		expect(alpha_of(e.get_buffer()[10*20+10]), 127, 2, "linearRGB luminance of red");
	}
	// 4. mask region clips hard
	{
		Canvas2D c(100,100); c.clear(0);
		Shape2D b = mask_box(0,0,100,100), full = mask_box(-50,-50,200,200);
		Mask* m = mk_mask();
		m->set_units(Mask::Units::UserSpaceOnUse).set_region(10,10,30,30).add_shape(full, Paint(white));
		c.set_mask(m).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[20*100+20]), 255, 0, "inside region");
		expect(alpha_of(c.get_buffer()[5*100+5]), 0, 0, "outside region TL");
		expect(alpha_of(c.get_buffer()[60*100+60]), 0, 0, "outside region BR");
	}
	// 5. objectBoundingBox content units + default region
	{
		Canvas2D c(120,80); c.clear(0);
		Shape2D b = mask_box(20,10,60,30), unit = mask_box(0,0,1,1);
		LinearGradient* g = mk_lin(0,0,1,0);
		g->add_stop(0, rgba(0,0,0,255)).add_stop(1, white);
		Mask* m = mk_mask();
		m->set_content_units(Mask::Units::ObjectBoundingBox).add_shape(unit, Paint(g));
		c.set_mask(m).fill_style(rgba(255,128,0,255)).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[25*120+21]), 0, 8, "OBB content left");
		expect(alpha_of(c.get_buffer()[25*120+78]), 255, 8, "OBB content right");
		expect(alpha_of(c.get_buffer()[60*120+100]), 0, 0, "outside object");
	}
	// 6. empty mask hides, clear_mask restores
	{
		Canvas2D c(40,40); c.clear(0);
		Shape2D b = mask_box(0,0,40,40);
		Mask* m = mk_mask();
		c.set_mask(m).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[20*40+20]), 0, 0, "empty mask hides");
		c.clear_mask().path(b);
		expect(alpha_of(c.get_buffer()[20*40+20]), 255, 0, "clear_mask restores");
	}
	// 7. mask transform + save/restore of the mask state
	{
		Canvas2D c(60,20); c.clear(0);
		Shape2D b = mask_box(0,0,60,20), left = mask_box(0,0,20,20);
		Mask* m = mk_mask();
		m->set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,60,20).set_transform(1,0,0,1,20,0).add_shape(left, Paint(white));
		c.save();
		c.set_mask(m).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[10*60+5]), 0, 0, "mask transform shift");
		expect(alpha_of(c.get_buffer()[10*60+30]), 255, 0, "mask transform shift 2");
		c.restore();
		expect(c.get_mask() ? 1 : 0, 0, 0, "restore pops mask");
		c.clear(0).path(b);
		expect(alpha_of(c.get_buffer()[10*60+5]), 255, 0, "unmasked after restore");
	}
	// 8. canvas-as-mask + match-source resolution
	{
		Canvas2D src(32,32); src.clear(0);
		Shape2D half = mask_box(0,0,16,32);
		src.fill_style(white).stroke_style(tr).path(half);
		Canvas2D c(32,32); c.clear(0);
		Shape2D b = mask_box(0,0,32,32);
		Mask* m = mk_mask();
		m->set_type(Mask::Type::MatchSource).set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,32,32).add(src);
		c.set_mask(m).fill_style(rgba(255,0,255,255)).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[16*32+8]), 255, 0, "canvas mask opaque half");
		expect(alpha_of(c.get_buffer()[16*32+24]), 0, 0, "canvas mask empty half");
		expect((int)m->effective_type(), (int)Mask::Type::Alpha, 0, "match-source -> alpha");
	}
	// 9. regression: no mask bound behaves exactly as before
	{
		Canvas2D c(50,50); c.clear(0);
		Shape2D b = mask_box(10,10,30,30);
		c.fill_style(rgba(10,20,30,255)).stroke_style(tr).path(b);
		expect((int)c.get_buffer()[25*50+25], (int)rgba(10,20,30,255), 0, "unmasked fill unchanged");
		expect(alpha_of(c.get_buffer()[5*50+5]), 0, 0, "unmasked outside unchanged");
	}
	// 10. normalized SVG commands as mask geometry: A/a disc (et + etr) and H/V half
	{
		Canvas2D c(60,60); c.clear(0);
		Shape2D b = mask_box(0,0,60,60);
		// Full disc r=20 at (30,30) from two SVG elliptical arcs (absolute + relative).
		Shape2D d; d.mt(10,30).et(20,20,0,false,true,50,30).etr(20,20,0,false,true,-40,0).close();
		Mask* m = mk_mask();
		m->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,60,60).add_shape(d, Paint(white));
		c.set_mask(m).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[30*60+30]), 255, 0, "A-arc mask centre");
		expect(alpha_of(c.get_buffer()[12*60+30]), 255, 0, "A-arc mask top inside");
		expect(alpha_of(c.get_buffer()[55*60+30]), 0, 0, "A-arc mask bottom outside");
		expect(alpha_of(c.get_buffer()[30*60+5]), 0, 0, "A-arc mask left outside");
		c.clear_mask();
		// Left half built with H/V commands, alpha 128.
		Canvas2D e(60,60); e.clear(0);
		Shape2D half; half.mt(0,0).h(30).v(60).h(0).close();
		Mask* m2 = mk_mask();
		m2->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,60,60)
		.add_shape(half, Paint(rgba(255,255,255,128)));
		e.set_mask(m2).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(e.get_buffer()[30*60+15]), 128, 1, "H/V mask covered half");
		expect(alpha_of(e.get_buffer()[30*60+45]), 0, 0, "H/V mask uncovered half");
	}
	g_mask_selftest_checks = checks;
	mask_pool_reset();
	std::printf("[mask self-test] %u/%u checks passed\n", checks - fails, checks);
	return fails;
}
ag_export(get_mask_selftest_checks) uint32_t get_mask_selftest_checks() { return g_mask_selftest_checks; }
// ============================================================================
// TEST 17 SUPPORT - SVG 2 CLIPPING (clip-path / clip-rule / clipPathUnits)
// ClipPaths / paint servers are heap objects (shared AtomicMalloc heap) and
// pooled so every temporary is explicitly freed when the test finishes.
// IMPORTANT: ClipPath children are BORROWED pointers - every clip shape must be
// a named local (or container element) that outlives the draws, never a
// temporary returned by mask_box/mask_disc/mask_star (that caused the OOB crash
// in clip_device_bounds; the header now rejects temporaries at compile time).
// ============================================================================
static std::vector<ClipPath*> g_clip_pool;
static std::vector<Gradient*> g_clip_paint_pool;
static uint32_t g_clip_selftest_checks = 0;
static void clip_pool_reset() {
	for (ClipPath* cp : g_clip_pool) delete cp;
	g_clip_pool.clear();
	for (Gradient* g : g_clip_paint_pool) delete g;
	g_clip_paint_pool.clear();
}
static ClipPath* mk_clip() { ClipPath* cp = new ClipPath(); g_clip_pool.push_back(cp); return cp; }
static LinearGradient* mk_clin(float x1, float y1, float x2, float y2) {
	LinearGradient* g = new LinearGradient(x1, y1, x2, y2); g_clip_paint_pool.push_back(g); return g;
}
static RadialGradient* mk_crad(float cx, float cy, float r) {
	RadialGradient* g = new RadialGradient(cx, cy, r, cx, cy); g_clip_paint_pool.push_back(g); return g;
}
// Self-intersecting {5/2} star polygon: nonzero fills the centre, evenodd holes it.
static Shape2D clip_pentagram(float cx, float cy, float r) {
	Shape2D s;
	for (int i = 0; i < 5; ++i) {
		float a = (-90.0f + i * 144.0f) * 3.14159265f / 180.0f;
		float x = cx + r * std::cos(a), y = cy + r * std::sin(a);
		if (i == 0) s.mt(x, y); else s.lt(x, y);
	}
	s.close(); return s;
}
ag_export(run_clip_demo)
uint32_t run_clip_demo(uint32_t width, uint32_t height) {
	if (width == 0 || height == 0) { width = 700; height = 1120; }
	if (g_clip_canvas) delete g_clip_canvas;
	g_clip_canvas = new Canvas2D(width, height);
	Canvas2D& c = *g_clip_canvas;
	clip_pool_reset();
	mask_pool_reset();
	const float s = std::min(width / 700.0f, height / 1120.0f);
	const uint32_t bg = rgba(24,28,36,255), tr = rgba(0,0,0,0), guide = rgba(90,90,110,90);
	const uint32_t dim = rgba(175,180,195,255), head = rgba(120,200,255,255), white = rgba(255,255,255,255);
	const float TW = 200.0f, TH = 90.0f, CX[3] = {30.0f, 250.0f, 470.0f};
	c.clear(bg);
	c.save();
	c.scale(s, s);
	c.fill_style(tr).stroke_style(guide);
	for (int gx = 0; gx <= 700; gx += 50) { Shape2D p; p.mt(gx,0).lt(gx,1120).set_line_width(0.5f); c.path(p); }
	for (int gy = 0; gy <= 1120; gy += 50) { Shape2D p; p.mt(0,gy).lt(700,gy).set_line_width(0.5f); c.path(p); }
	auto label = [&](const char* txt, float x, float y, float px, uint32_t col) {
		if (!g_font) return;
		g_font->set_pixel_height(px);
		c.font(g_font).fill_style(col).stroke_style(tr).fill_text(txt, x, y);
	};
	auto section = [&](const char* txt, float y) { label(txt, 30, y, 26, head); };
	// Checkerboard behind each tile so clipped-out areas are obvious.
	auto checker = [&](float x, float y, float w, float h) {
		const int cell = 12;
		for (int yy = 0; yy < h; yy += cell) for (int xx = 0; xx < w; xx += cell) {
			Shape2D p = mask_box(x + xx, y + yy, std::min((float)cell, w - xx), std::min((float)cell, h - yy));
			c.fill_style((((xx / cell) + (yy / cell)) % 2 == 0) ? rgba(72,76,92,255) : rgba(46,50,62,255)).stroke_style(tr).path(p);
		}
	};
	auto rainbow = [&](float x, float y, float w) {
		LinearGradient* g = mk_clin(x, y, x + w, y);
		g->add_stop(0.0f, rgba(255,70,70,255)).add_stop(0.5f, rgba(255,220,70,255)).add_stop(1.0f, rgba(70,160,255,255));
		return g;
	};
	// ---- 1. clip-path basics: anti-aliased silhouettes (alpha clipping) ----
	section("1. clip-path: anti-aliased silhouettes", 34);
	{
		const float y = 48;
		checker(CX[0], y, TW, TH);
		Shape2D r = mask_box(CX[0], y, TW, TH);
		Shape2D dc = mask_disc(CX[0] + TW * 0.5f, y + TH * 0.5f, TH * 0.48f);
		ClipPath* cp = mk_clip(); cp->add(dc);
		c.set_clip(cp).fill_style(rainbow(CX[0], y, TW)).stroke_style(tr).path(r);
		c.clear_clip();
		label("circle clip", CX[0], y + TH + 20, 19, dim);
		checker(CX[1], y, TW, TH);
		Shape2D r2 = mask_box(CX[1], y, TW, TH);
		Shape2D st = mask_star(CX[1] + TW * 0.5f, y + TH * 0.5f, TH * 0.55f, TH * 0.24f);
		ClipPath* cp2 = mk_clip(); cp2->add(st);
		c.set_clip(cp2).fill_style(rainbow(CX[1], y, TW)).stroke_style(tr).path(r2);
		c.clear_clip();
		label("star clip", CX[1], y + TH + 20, 19, dim);
		checker(CX[2], y, TW, TH);
		Shape2D r3 = mask_box(CX[2], y, TW, TH);
		// Lens built from two SVG elliptical arcs (A/a) instead of quadratics.
		Shape2D lens; lens.mt(CX[2] + 10, y + 45).et(95, 55, 0, false, true, CX[2] + 190, y + 45)
		.et(95, 55, 0, false, true, CX[2] + 10, y + 45).close();
		ClipPath* cp3 = mk_clip(); cp3->add(lens);
		c.set_clip(cp3).fill_style(rainbow(CX[2], y, TW)).stroke_style(tr).path(r3);
		c.clear_clip();
		label("SVG arc (lens) clip", CX[2], y + TH + 20, 19, dim);
	}
	// ---- 2. clip-rule: nonzero (default) vs evenodd ----
	section("2. clip-rule: nonzero / evenodd", 190);
	{
		const float y = 204;
		checker(CX[0], y, TW, TH);
		Shape2D r = mask_box(CX[0], y, TW, TH);
		Shape2D pg = clip_pentagram(CX[0] + TW * 0.5f, y + TH * 0.5f, TH * 0.52f);
		ClipPath* nz = mk_clip(); nz->add(pg, ClipPath::Rule::NonZero);
		c.set_clip(nz).fill_style(rgba(255,140,60,255)).stroke_style(tr).path(r);
		c.clear_clip();
		label("nonzero (default)", CX[0], y + TH + 20, 19, dim);
		checker(CX[1], y, TW, TH);
		Shape2D r2 = mask_box(CX[1], y, TW, TH);
		Shape2D pg2 = clip_pentagram(CX[1] + TW * 0.5f, y + TH * 0.5f, TH * 0.52f);
		ClipPath* eo = mk_clip(); eo->add(pg2, ClipPath::Rule::EvenOdd);
		c.set_clip(eo).fill_style(rgba(90,220,255,255)).stroke_style(tr).path(r2);
		c.clear_clip();
		label("evenodd (hollow centre)", CX[1], y + TH + 20, 19, dim);
		checker(CX[2], y, TW, TH);
		Shape2D r3 = mask_box(CX[2], y, TW, TH);
		// Two SAME-direction subpaths: nonzero = solid disc, evenodd = ring.
		Shape2D dn; dn.mt(CX[2] + TW * 0.5f + 42, y + 45).at(CX[2] + TW * 0.5f, y + 45, 42, 0, 6.2831853f, false).close()
		.mt(CX[2] + TW * 0.5f + 20, y + 45).at(CX[2] + TW * 0.5f, y + 45, 20, 0, 6.2831853f, false).close();
		ClipPath* ring = mk_clip(); ring->add(dn, ClipPath::Rule::EvenOdd);
		c.set_clip(ring).fill_style(rgba(120,255,170,255)).stroke_style(tr).path(r3);
		c.clear_clip();
		label("evenodd ring (same dir)", CX[2], y + TH + 20, 19, dim);
	}
	// ---- 3. clipPathUnits = objectBoundingBox ----
	section("3. clipPathUnits = objectBoundingBox", 346);
	{
		const float y = 360;
		Shape2D unit = mask_disc(0.5f, 0.5f, 0.5f);
		ClipPath* uc = mk_clip();
		uc->set_units(ClipPath::Units::ObjectBoundingBox).add(unit);
		Shape2D r = mask_box(CX[0], y, TW, TH);
		Shape2D d = mask_disc(CX[1] + TW * 0.5f, y + TH * 0.5f, TH * 0.5f);
		Shape2D st = mask_star(CX[2] + TW * 0.5f, y + TH * 0.5f, TH * 0.55f, TH * 0.24f);
		checker(CX[0], y, TW, TH); checker(CX[1], y, TW, TH); checker(CX[2], y, TW, TH);
		c.set_clip(uc).stroke_style(tr);
		c.fill_style(rgba(255,140,60,255)).path(r);
		c.fill_style(rgba(90,220,255,255)).path(d);
		c.fill_style(rgba(190,120,255,255)).path(st);
		c.clear_clip();
		label("one unit clip, three bounding boxes", CX[0], y + TH + 20, 19, dim);
	}
	// ---- 4. clip transform: rotate / scale / translate ----
	section("4. clip transform (rotate / scale / translate)", 502);
	{
		const float y = 516;
		checker(CX[0], y, TW, TH);
		Shape2D r = mask_box(CX[0], y, TW, TH);
		std::vector<Shape2D> bars; bars.reserve(10);
		for (int i = 0; i < 8; ++i) bars.push_back(mask_box(CX[0] - 40 + i * 34.0f, y - 40, 17.0f, TH + 80));
		ClipPath* cp = mk_clip();
		for (const Shape2D& b : bars) cp->add(b);
		Transform rt;
		rt.translate(CX[0] + TW * 0.5f, y + TH * 0.5f); rt.rotate(0.5f); rt.translate(-(CX[0] + TW * 0.5f), -(y + TH * 0.5f));
		cp->transform() = rt;
		c.set_clip(cp).fill_style(rgba(255,210,90,255)).stroke_style(tr).path(r);
		c.clear_clip();
		label("transform rotate", CX[0], y + TH + 20, 19, dim);
		checker(CX[1], y, TW, TH);
		Shape2D r2 = mask_box(CX[1], y, TW, TH);
		Shape2D dc = mask_disc(CX[1] + TW * 0.5f, y + TH * 0.5f, 30.0f);
		ClipPath* cp2 = mk_clip(); cp2->add(dc);
		Transform st2;
		st2.translate(CX[1] + TW * 0.5f, y + TH * 0.5f); st2.scale(2.6f, 1.1f); st2.translate(-(CX[1] + TW * 0.5f), -(y + TH * 0.5f));
		cp2->transform() = st2;
		c.set_clip(cp2).fill_style(rgba(120,255,170,255)).stroke_style(tr).path(r2);
		c.clear_clip();
		label("transform scale", CX[1], y + TH + 20, 19, dim);
		checker(CX[2], y, TW, TH);
		Shape2D r3 = mask_box(CX[2], y, TW, TH);
		Shape2D dc3 = mask_disc(CX[2] + 60, y + 45, 32.0f);
		ClipPath* cp3 = mk_clip(); cp3->add(dc3).set_transform(1, 0, 0, 1, 80, 0);
		c.set_clip(cp3).fill_style(rainbow(CX[2], y, TW)).stroke_style(tr).path(r3);
		c.clear_clip();
		label("transform translate", CX[2], y + TH + 20, 19, dim);
	}
	// ---- 5. union of children & nested clip-path (intersection) ----
	section("5. children union / nested clip-path intersection", 658);
	{
		const float y = 672;
		checker(CX[0], y, TW, TH);
		Shape2D r = mask_box(CX[0], y, TW, TH);
		Shape2D d1 = mask_disc(CX[0] + 55, y + 45, 32), d2 = mask_disc(CX[0] + 145, y + 45, 32);
		Shape2D bar = mask_box(CX[0] + 55, y + 30, 90, 30);
		ClipPath* un = mk_clip(); un->add(d1).add(d2).add(bar);
		c.set_clip(un).fill_style(rainbow(CX[0], y, TW)).stroke_style(tr).path(r);
		c.clear_clip();
		label("union of children", CX[0], y + TH + 20, 19, dim);
		checker(CX[1], y, TW, TH);
		Shape2D r2 = mask_box(CX[1], y, TW, TH);
		std::vector<Shape2D> vb; vb.reserve(8);
		for (int i = 0; i < 7; ++i) vb.push_back(mask_box(CX[1] + 8 + i * 28.0f, y, 14.0f, TH));
		std::vector<Shape2D> hb; hb.reserve(4);
		for (int i = 0; i < 3; ++i) hb.push_back(mask_box(CX[1], y + 8 + i * 30.0f, TW, 15.0f));
		ClipPath* cv = mk_clip(); for (const Shape2D& b : vb) cv->add(b);
		ClipPath* ch = mk_clip(); for (const Shape2D& b : hb) ch->add(b);
		cv->set_clip_path(ch);                         // clip-path on the clipPath: intersection
		c.set_clip(cv).fill_style(rgba(255,120,200,255)).stroke_style(tr).path(r2);
		c.clear_clip();
		label("vbars INTERSECT hbars", CX[1], y + TH + 20, 19, dim);
		checker(CX[2], y, TW, TH);
		Shape2D r3 = mask_box(CX[2], y, TW, TH);
		std::vector<Shape2D> vb2; vb2.reserve(8);
		for (int i = 0; i < 7; ++i) vb2.push_back(mask_box(CX[2] + 8 + i * 28.0f, y, 14.0f, TH));
		Shape2D dc2 = mask_disc(CX[2] + TW * 0.5f, y + TH * 0.5f, TH * 0.5f);   // named: must outlive the draw
		ClipPath* cv2 = mk_clip(); for (const Shape2D& b : vb2) cv2->add(b);
		ClipPath* cd = mk_clip(); cd->add(dc2);
		cv2->set_clip_path(cd);
		c.set_clip(cv2).fill_style(rgba(120,200,255,255)).stroke_style(tr).path(r3);
		c.clear_clip();
		label("vbars INTERSECT disc", CX[2], y + TH + 20, 19, dim);
	}
	// ---- 6. clipped strokes / dashes / shadow / blend + save/restore ----
	section("6. clipped strokes / dashes / shadow / blend", 814);
	{
		const float y = 828;
		checker(CX[0], y, TW, TH);
		Shape2D line; line.mt(CX[0] - 10, y + TH * 0.5f).lt(CX[0] + TW + 10, y + TH * 0.5f)
		.set_line_width(24).set_line_cap(Shape2D::CAP_ROUND).set_dash_array({22,12});
		Shape2D dc = mask_disc(CX[0] + TW * 0.5f, y + TH * 0.5f, TH * 0.5f);    // named: must outlive the draw
		ClipPath* cp = mk_clip(); cp->add(dc);
		c.set_clip(cp).fill_style(tr).stroke_style(rgba(255,120,200,255)).path(line);
		c.clear_clip();
		label("dashed stroke clipped", CX[0], y + TH + 20, 19, dim);
		checker(CX[1], y, TW, TH);
		Shape2D shp = mask_star(CX[1] + TW * 0.5f, y + TH * 0.5f, 44.0f, 20.0f);
		shp.set_line_width(6).set_line_join(Shape2D::JOIN_ROUND);
		Shape2D win = mask_box(CX[1] + 40, y + 12, TW - 80, TH - 24);           // named: must outlive the draw
		ClipPath* cp2 = mk_clip(); cp2->add(win);
		c.set_clip(cp2).drop_shadow(5, 5, 3, rgba(0,0,0,230))
		.fill_style(rgba(255,230,120,255)).stroke_style(rgba(255,120,60,255)).path(shp);
		c.clear_shadow().clear_clip();
		label("fill+stroke+shadow clipped", CX[1], y + TH + 20, 19, dim);
		checker(CX[2], y, TW, TH);
		Shape2D base = mask_box(CX[2] + 10, y + 10, TW - 20, TH - 20);
		c.fill_style(rgba(40,90,180,255)).stroke_style(tr).path(base);
		Shape2D left = mask_box(CX[2], y, TW * 0.5f, TH);                       // named: must outlive the draw
		ClipPath* cp3 = mk_clip(); cp3->add(left);
		c.save();
		c.set_clip(cp3).blend_mode(BlendMode::Screen).fill_style(rgba(255,140,40,255)).stroke_style(tr).path(base);
		c.restore();                                   // pops clip AND blend mode
		Shape2D mark = mask_box(CX[2] + TW - 26, y + TH - 22, 16, 12);
		c.fill_style(white).stroke_style(tr).path(mark);   // unclipped proof
		label("screen + save/restore", CX[2], y + TH + 20, 19, dim);
	}
	// ---- 7. clip + mask / clipped text / clipped image ----
	section("7. clip + mask / text / image", 970);
	{
		const float y = 984;
		checker(CX[0], y, TW, TH);
		Shape2D r = mask_box(CX[0], y, TW, TH);
		Shape2D dc = mask_disc(CX[0] + TW * 0.5f, y + TH * 0.5f, TH * 0.5f);    // named: must outlive the draw
		ClipPath* cp = mk_clip(); cp->add(dc);
		LinearGradient* g = mk_clin(CX[0], y, CX[0] + TW, y);
		g->add_stop(0, rgba(0,0,0,255)).add_stop(1, white);
		Mask* m = mk_mask();
		m->set_units(Mask::Units::UserSpaceOnUse).set_region(CX[0], y, TW, TH).add_shape(r, Paint(g));
		c.set_clip(cp).set_mask(m).fill_style(rainbow(CX[0], y, TW)).stroke_style(tr).path(r);
		c.clear_mask().clear_clip();
		label("clip INTERSECT mask (one pass)", CX[0], y + TH + 20, 19, dim);
		checker(CX[1], y, TW, TH);
		Shape2D dc2 = mask_disc(CX[1] + TW * 0.5f, y + TH * 0.5f, TH * 0.55f);  // named: must outlive the draw
		ClipPath* cp2 = mk_clip(); cp2->add(dc2);
		c.set_clip(cp2);
		if (g_font) {
			g_font->set_pixel_height(64);
			c.font(g_font).fill_style(rgba(255,220,120,255)).stroke_style(tr).fill_text("CLIP", CX[1] + 28, y + 66);
			g_font->set_pixel_height(22);
			c.set_line_dash({8,5});
			c.stroke_style(rgba(120,255,220,255)).stroke_text("SVG 2", CX[1] + 62, y + 86);
			c.set_line_dash({});
		} else {
			Shape2D fb = mask_box(CX[1] + 20, y + 25, TW - 40, TH - 50);
			c.fill_style(rgba(255,220,120,255)).stroke_style(tr).path(fb);
		}
		c.clear_clip();
		label(g_font ? "fill_text + stroke_text" : "run Font Test first", CX[1], y + TH + 20, 19, dim);
		checker(CX[2], y, TW, TH);
		Shape2D r3 = mask_box(CX[2], y, TW, TH);
		Shape2D st = mask_star(CX[2] + TW * 0.5f, y + TH * 0.5f, TH * 0.55f, TH * 0.24f);   // named: must outlive the draw
		ClipPath* cp3 = mk_clip(); cp3->add(st);
		bool drew_img = false;
		if (g_prefetched_image_data && g_prefetched_image_size > 0) {
			Image img;
			if (img.loadFromMemory(g_prefetched_image_data, (int)g_prefetched_image_size, 0)) {
				c.set_clip(cp3).draw_image(img, CX[2], y, TW, TH);
				c.clear_clip();
				drew_img = true;
			}
		}
		if (!drew_img) {
			c.set_clip(cp3).fill_style(rainbow(CX[2], y, TW)).stroke_style(tr).path(r3);
			c.clear_clip();
		}
		label(drew_img ? "draw_image clipped" : "prefetch an image first", CX[2], y + TH + 20, 19, dim);
	}
	c.restore();
	c.clear_clip().clear_mask().fill_style(tr).stroke_style(tr);
	clip_pool_reset();
	mask_pool_reset();
	return 1;
}
// ============================================================================
// TEST 17b - NUMERIC CLIP SELF-TEST (returns the failure count, 0 = all pass)
// ============================================================================
ag_export(run_clip_selftest)
uint32_t run_clip_selftest() {
	clip_pool_reset();
	mask_pool_reset();
	uint32_t fails = 0, checks = 0;
	const uint32_t tr = rgba(0,0,0,0), white = rgba(255,255,255,255);
	auto alpha_of = [](uint32_t v) { return (int)(v >> 24); };
	auto expect = [&](int got, int want, int tol, const char* name) {
		++checks;
		if (got < want - tol || got > want + tol) {
			++fails;
			std::printf("[clip self-test] FAIL %s: got %d, want %d (+/-%d)\n", name, got, want, tol);
		}
	};
	// 1. disc clip: inside visible, outside hidden, straight RGB preserved
	{
		Canvas2D c(100, 50); c.clear(0);
		Shape2D b = mask_box(0,0,100,50), d = mask_disc(50,25,20);
		ClipPath* cp = mk_clip(); cp->add(d);
		c.set_clip(cp).fill_style(rgba(255,0,0,255)).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[25*100+50]), 255, 0, "clip inside");
		expect(alpha_of(c.get_buffer()[25*100+5]), 0, 0, "clip outside");
		expect((int)(c.get_buffer()[25*100+50] & 255), 255, 0, "straight RGB preserved");
	}
	// 2. anti-aliased clip edge: half-covered pixel gets ~128 alpha (alpha clipping)
	{
		Canvas2D c(40, 10); c.clear(0);
		Shape2D b = mask_box(0,0,40,10), half = mask_box(10.5f,0,29.5f,10);
		ClipPath* cp = mk_clip(); cp->add(half);
		c.set_clip(cp).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[5*40+9]), 0, 0, "AA left of edge");
		expect(alpha_of(c.get_buffer()[5*40+10]), 128, 3, "AA half-covered edge pixel");
		expect(alpha_of(c.get_buffer()[5*40+11]), 255, 0, "AA right of edge");
	}
	// 3. clip-rule on a self-intersecting pentagram: nonzero fills, evenodd holes
	{
		Shape2D b = mask_box(0,0,100,100);
		Shape2D pg = clip_pentagram(50,50,40);
		ClipPath* nz = mk_clip(); nz->add(pg, ClipPath::Rule::NonZero);
		Canvas2D a(100,100); a.clear(0);
		a.set_clip(nz).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(a.get_buffer()[50*100+50]), 255, 0, "nonzero pentagram centre");
		ClipPath* eo = mk_clip(); eo->add(pg, ClipPath::Rule::EvenOdd);
		Canvas2D e(100,100); e.clear(0);
		e.set_clip(eo).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(e.get_buffer()[50*100+50]), 0, 0, "evenodd pentagram centre");
		expect(alpha_of(e.get_buffer()[20*100+50]), 255, 0, "evenodd pentagram arm");
	}
	// 4. clip-rule on same-direction subpaths: nonzero solid, evenodd ring
	{
		Shape2D b = mask_box(0,0,100,100);
		Shape2D dn; dn.mt(80,50).at(50,50,30,0,6.2831853f,false).close()
		.mt(65,50).at(50,50,15,0,6.2831853f,false).close();
		ClipPath* nz = mk_clip(); nz->add(dn, ClipPath::Rule::NonZero);
		Canvas2D a(100,100); a.clear(0);
		a.set_clip(nz).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(a.get_buffer()[50*100+50]), 255, 0, "nonzero same-dir centre");
		ClipPath* eo = mk_clip(); eo->add(dn, ClipPath::Rule::EvenOdd);
		Canvas2D e(100,100); e.clear(0);
		e.set_clip(eo).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(e.get_buffer()[50*100+50]), 0, 0, "evenodd same-dir hole");
		expect(alpha_of(e.get_buffer()[50*100+72]), 255, 0, "evenodd same-dir ring");
	}
	// 5. clipPathUnits = objectBoundingBox: unit circle maps onto the element bbox
	{
		Canvas2D c(120,80); c.clear(0);
		Shape2D b = mask_box(20,10,60,30), unit = mask_disc(0.5f,0.5f,0.5f);
		ClipPath* cp = mk_clip(); cp->set_units(ClipPath::Units::ObjectBoundingBox).add(unit);
		c.set_clip(cp).fill_style(rgba(0,255,0,255)).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[25*120+50]), 255, 0, "OBB clip centre");
		expect(alpha_of(c.get_buffer()[12*120+22]), 0, 0, "OBB clip corner");
		expect(alpha_of(c.get_buffer()[60*120+100]), 0, 0, "OBB outside object");
	}
	// 6. clip transform shifts the clip geometry
	{
		Canvas2D c(60,20); c.clear(0);
		Shape2D b = mask_box(0,0,60,20), left = mask_box(0,0,20,20);
		ClipPath* cp = mk_clip(); cp->add(left).set_transform(1,0,0,1,20,0);
		c.set_clip(cp).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[10*60+5]), 0, 0, "clip transform shift");
		expect(alpha_of(c.get_buffer()[10*60+30]), 255, 0, "clip transform shift 2");
	}
	// 7. union of children: both discs visible, gap hidden
	{
		Canvas2D c(100,40); c.clear(0);
		Shape2D b = mask_box(0,0,100,40);
		Shape2D d1 = mask_disc(25,20,15), d2 = mask_disc(75,20,15);
		ClipPath* cp = mk_clip(); cp->add(d1).add(d2);
		c.set_clip(cp).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[20*100+25]), 255, 0, "union child 1");
		expect(alpha_of(c.get_buffer()[20*100+75]), 255, 0, "union child 2");
		expect(alpha_of(c.get_buffer()[20*100+50]), 0, 0, "union gap");
	}
	// 8. nested clip-path (intersection): vertical bar INTERSECT horizontal bar
	{
		Canvas2D c(60,60); c.clear(0);
		Shape2D b = mask_box(0,0,60,60);
		Shape2D vert = mask_box(20,0,20,60), horz = mask_box(0,20,60,20);
		ClipPath* cv = mk_clip(); cv->add(vert);
		ClipPath* ch = mk_clip(); ch->add(horz);
		cv->set_clip_path(ch);
		c.set_clip(cv).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[30*60+30]), 255, 0, "intersection centre");
		expect(alpha_of(c.get_buffer()[5*60+30]), 0, 0, "vertical bar only");
		expect(alpha_of(c.get_buffer()[30*60+5]), 0, 0, "horizontal bar only");
	}
	// 9. three-level nested clip chain
	{
		Canvas2D c(60,40); c.clear(0);
		Shape2D b = mask_box(0,0,60,40);
		Shape2D s1 = mask_box(0,0,40,40), s2 = mask_box(10,0,40,40), s3 = mask_box(20,0,40,40);
		ClipPath* c1 = mk_clip(); c1->add(s1);
		ClipPath* c2 = mk_clip(); c2->add(s2);
		ClipPath* c3 = mk_clip(); c3->add(s3);
		c1->set_clip_path(c2); c2->set_clip_path(c3);
		c.set_clip(c1).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[20*60+25]), 255, 0, "chain x=25 inside");
		expect(alpha_of(c.get_buffer()[20*60+15]), 0, 0, "chain x=15 outside");
		expect(alpha_of(c.get_buffer()[20*60+5]), 0, 0, "chain x=5 outside");
		expect(alpha_of(c.get_buffer()[20*60+45]), 0, 0, "chain x=45 outside");
	}
	// 10. empty clip hides everything, clear_clip restores
	{
		Canvas2D c(40,40); c.clear(0);
		Shape2D b = mask_box(0,0,40,40);
		ClipPath* cp = mk_clip();
		c.set_clip(cp).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[20*40+20]), 0, 0, "empty clip hides");
		c.clear_clip().path(b);
		expect(alpha_of(c.get_buffer()[20*40+20]), 255, 0, "clear_clip restores");
	}
	// 11. save/restore pops the clip state
	{
		Canvas2D c(60,20); c.clear(0);
		Shape2D b = mask_box(0,0,60,20), left = mask_box(0,0,20,20);
		ClipPath* cp = mk_clip(); cp->add(left);
		c.save();
		c.set_clip(cp).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[10*60+40]), 0, 0, "clipped inside save");
		c.restore();
		expect(c.get_clip() ? 1 : 0, 0, 0, "restore pops clip");
		c.clear(0).path(b);
		expect(alpha_of(c.get_buffer()[10*60+40]), 255, 0, "unclipped after restore");
	}
	// 12. clip combines multiplicatively with a bound mask in one pass
	{
		Canvas2D c(80,20); c.clear(0);
		Shape2D b = mask_box(0,0,80,20), right = mask_box(40,0,40,20);
		ClipPath* cp = mk_clip(); cp->add(right);
		Mask* m = mk_mask();
		m->set_type(Mask::Type::Alpha).set_units(Mask::Units::UserSpaceOnUse).set_region(0,0,80,20)
		.add_shape(b, Paint(rgba(255,255,255,128)));
		c.set_clip(cp).set_mask(m).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[10*80+60]), 128, 1, "clip x mask overlap");
		expect(alpha_of(c.get_buffer()[10*80+20]), 0, 0, "mask-only region clipped");
		c.clear_mask().clear_clip();
	}
	// 13. draw_pixels is clipped
	{
		Canvas2D c(40,40); c.clear(0);
		uint32_t px[4] = {white, white, white, white};
		Shape2D right = mask_box(20,0,20,40);
		ClipPath* cp = mk_clip(); cp->add(right);
		c.set_clip(cp).draw_pixels(px, 2, 2, 0, 0, 40, 40);
		expect(alpha_of(c.get_buffer()[20*40+30]), 255, 0, "pixels inside clip");
		expect(alpha_of(c.get_buffer()[20*40+10]), 0, 0, "pixels outside clip");
	}
	// 14. strokes are clipped (stroke geometry extends past the clip box)
	{
		Canvas2D c(60,60); c.clear(0);
		Shape2D line; line.mt(0,30).lt(60,30).set_line_width(20);
		Shape2D band = mask_box(0,20,30,20);
		ClipPath* cp = mk_clip(); cp->add(band);
		c.set_clip(cp).fill_style(tr).stroke_style(white).path(line);
		expect(alpha_of(c.get_buffer()[30*60+15]), 255, 0, "stroke inside clip");
		expect(alpha_of(c.get_buffer()[30*60+45]), 0, 0, "stroke outside clip x");
		expect(alpha_of(c.get_buffer()[5*60+15]), 0, 0, "stroke outside clip y");
	}
	// 15. normalized SVG commands (H/h V/v S/s T/t A/a) as clip geometry
	{
		Shape2D b = mask_box(0,0,100,100);
		// H/V square (relative htr/vtr) covering (10,10)-(60,60).
		Canvas2D c(100,100); c.clear(0);
		Shape2D hv; hv.mt(10,10).htr(50).vtr(50).htr(-50).close();
		ClipPath* cphv = mk_clip(); cphv->add(hv);
		c.set_clip(cphv).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(c.get_buffer()[35*100+35]), 255, 0, "H/V clip inside");
		expect(alpha_of(c.get_buffer()[35*100+70]), 0, 0, "H/V clip right outside");
		expect(alpha_of(c.get_buffer()[70*100+35]), 0, 0, "H/V clip bottom outside");
		c.clear_clip();
		// T smooth quadratic boundary: Q(15,10) peaks at y=25, reflected T dips to y=55.
		Canvas2D d(100,100); d.clear(0);
		Shape2D tq; tq.mt(0,40).qt(15,10,30,40).t(60,40).lt(60,90).h(0).close();
		ClipPath* cpt = mk_clip(); cpt->add(tq);
		d.set_clip(cpt).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(d.get_buffer()[60*100+15]), 255, 0, "T clip under first bump");
		expect(alpha_of(d.get_buffer()[15*100+15]), 0, 0, "T clip above first bump");
		expect(alpha_of(d.get_buffer()[65*100+45]), 255, 0, "T clip under reflected dip");
		expect(alpha_of(d.get_buffer()[45*100+45]), 0, 0, "T clip above reflected dip");
		d.clear_clip();
		// S smooth cubic boundary: C peaks at y=17.5, reflected S dips to y=62.5.
		Canvas2D e(100,100); e.clear(0);
		Shape2D sc; sc.mt(0,40).ct(10,10,20,10,30,40).s(50,70,60,40).lt(60,90).h(0).close();
		ClipPath* cps = mk_clip(); cps->add(sc);
		e.set_clip(cps).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(e.get_buffer()[60*100+15]), 255, 0, "S clip under first bump");
		expect(alpha_of(e.get_buffer()[10*100+15]), 0, 0, "S clip above first bump");
		expect(alpha_of(e.get_buffer()[75*100+45]), 255, 0, "S clip under reflected dip");
		expect(alpha_of(e.get_buffer()[50*100+45]), 0, 0, "S clip above reflected dip");
		e.clear_clip();
		// A half-disc (sweep=1): upper half of circle centre (50,50) r=30.
		Canvas2D f(100,100); f.clear(0);
		Shape2D ha; ha.mt(20,50).et(30,30,0,false,true,80,50).close();
		ClipPath* cpa = mk_clip(); cpa->add(ha);
		f.set_clip(cpa).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(f.get_buffer()[30*100+50]), 255, 0, "A half-disc inside");
		expect(alpha_of(f.get_buffer()[70*100+50]), 0, 0, "A half-disc below chord");
		expect(alpha_of(f.get_buffer()[50*100+15]), 0, 0, "A half-disc left outside");
		f.clear_clip();
		// A large-arc (relative etr, large=1 sweep=0): major arc bulging down to y~72.
		Canvas2D g(100,100); g.clear(0);
		Shape2D la; la.mt(30,20).etr(30,30,0,true,false,40,0).close();
		ClipPath* cpl = mk_clip(); cpl->add(la);
		g.set_clip(cpl).fill_style(white).stroke_style(tr).path(b);
		expect(alpha_of(g.get_buffer()[50*100+50]), 255, 0, "A large-arc inside");
		expect(alpha_of(g.get_buffer()[10*100+50]), 0, 0, "A large-arc above chord");
		expect(alpha_of(g.get_buffer()[85*100+50]), 0, 0, "A large-arc below arc");
		g.clear_clip();
	}
	// 16. regression: no clip bound behaves exactly as before
	{
		Canvas2D c(50,50); c.clear(0);
		Shape2D b = mask_box(10,10,30,30);
		c.fill_style(rgba(10,20,30,255)).stroke_style(tr).path(b);
		expect((int)c.get_buffer()[25*50+25], (int)rgba(10,20,30,255), 0, "unclipped fill unchanged");
		expect(alpha_of(c.get_buffer()[5*50+5]), 0, 0, "unclipped outside unchanged");
	}
	g_clip_selftest_checks = checks;
	clip_pool_reset();
	mask_pool_reset();
	std::printf("[clip self-test] %u/%u checks passed\n", checks - fails, checks);
	return fails;
}
ag_export(get_clip_selftest_checks) uint32_t get_clip_selftest_checks() { return g_clip_selftest_checks; }
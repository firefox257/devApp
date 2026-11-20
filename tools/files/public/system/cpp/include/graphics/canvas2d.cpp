// ./canvas2d.cpp
#ifndef CANVAS2D_CPP
#define CANVAS2D_CPP
#include <graphics/canvas2d.hpp>
#include <graphics/canvas2d_styles.hpp>
#include <graphics/canvas2d_raster.cpp>
#include <graphics/canvas2d_text.cpp>
// ======================================================================
// STATE STACK
// ======================================================================
Canvas2D& Canvas2D::save() {
	m_state_stack.push_back(CanvasState{
			m_transform, m_fill_style, m_stroke_style, m_fill_rule, m_font, m_stroke_curve_steps,
			m_shadow_enabled, m_shadow_dx, m_shadow_dy, m_shadow_blur, m_shadow_color, m_blend_mode,
			m_composite_op, m_global_alpha, m_line_dash, m_line_dash_offset, m_mask, m_clip,
			m_marker_start, m_marker_mid, m_marker_end, m_filter,
			m_image_smoothing, m_image_smoothing_quality, m_text_style, m_font_set});
	return *this;
}
Canvas2D& Canvas2D::restore() {
	if (m_state_stack.empty()) return *this;
	CanvasState& s = m_state_stack.back();
	m_transform = s.transform; m_inv_dirty = true;
	m_fill_style = s.fill_style; m_stroke_style = s.stroke_style; m_fill_rule = s.fill_rule;
	m_font = s.font; m_stroke_curve_steps = s.stroke_curve_steps;
	m_shadow_enabled = s.shadow_enabled;
	m_shadow_dx = s.shadow_dx; m_shadow_dy = s.shadow_dy; m_shadow_blur = s.shadow_blur;
	m_shadow_color = s.shadow_color; m_blend_mode = s.blend_mode; m_composite_op = s.composite_op;
	m_global_alpha = s.global_alpha;
	m_line_dash = std::move(s.line_dash); m_line_dash_offset = s.line_dash_offset;
	m_mask = s.mask; m_clip = s.clip;
	m_marker_start = s.marker_start; m_marker_mid = s.marker_mid; m_marker_end = s.marker_end;
	m_filter = s.filter;
	m_image_smoothing = s.image_smoothing; m_image_smoothing_quality = s.image_smoothing_quality;
	m_text_style = std::move(s.text_style); m_font_set = s.font_set;
	m_state_stack.pop_back();
	return *this;
}
// ======================================================================
// PATTERN PREPARATION
// ======================================================================
void Pattern::prepare(float obj_x, float obj_y, float obj_w, float obj_h) const {
	if (!m_dirty && m_last_obj_x == obj_x && m_last_obj_y == obj_y &&
		m_last_obj_w == obj_w && m_last_obj_h == obj_h) return;
	m_last_obj_x = obj_x; m_last_obj_y = obj_y; m_last_obj_w = obj_w; m_last_obj_h = obj_h;
	if (m_items.empty()) { m_buf_w = 0; m_buf_h = 0; m_buffer.clear(); m_dirty = false; return; }
	if (!(width > 0.0f) || !(height > 0.0f)) { m_buf_w = 0; m_buf_h = 0; m_buffer.clear(); m_dirty = false; return; }
	int bw, bh;
	if (units == Units::ObjectBoundingBox) { bw = 256; bh = 256; }
	else { bw = (int)std::ceil(width); bh = (int)std::ceil(height); }
	if (bw < 1) bw = 1; if (bh < 1) bh = 1;
	if (bw > 2048) bw = 2048; if (bh > 2048) bh = 2048;
	m_buffer.assign(static_cast<size_t>(bw) * bh, 0u);
	m_buf_w = bw; m_buf_h = bh;
	Canvas2D ctx(bw, bh); ctx.clear(0);
	Transform ct;
	const float sx = static_cast<float>(bw) / width;
	const float sy = static_cast<float>(bh) / height;
	if (content_units == ContentUnits::ObjectBoundingBox) { ct.scale(sx, sy); }
	else { ct.scale(sx, sy); ct.translate(-x, -y); }
	ctx.setTransform(ct.a, ct.b, ct.c, ct.d, ct.e, ct.f);
	auto set_paint = [&](const Paint& p, bool is_fill) {
		if (p.type == Paint::GRADIENT && p.gradient) {
			p.gradient->prepare();
			if (is_fill) ctx.fill_style(p.gradient); else ctx.stroke_style(p.gradient);
		} else if (p.type == Paint::PATTERN && p.pattern) {
			if (is_fill) ctx.fill_style(p.pattern); else ctx.stroke_style(p.pattern);
		} else {
			const uint32_t c = (p.type == Paint::SOLID) ? p.color : 0u;
			if (is_fill) ctx.fill_style(c); else ctx.stroke_style(c);
		}
	};
	for (const auto& item : m_items) {
		if (item.shape) {
			set_paint(item.fill, true); set_paint(item.stroke, false);
			ctx.path(*item.shape);
		} else if (item.image) {
			const float w = (item.w != 0.0f) ? item.w : static_cast<float>(item.image->getWidth());
			const float h = (item.h != 0.0f) ? item.h : static_cast<float>(item.image->getHeight());
			ctx.draw_image(*item.image, item.x, item.y, w, h);
		} else if (item.pixels) {
			const float w = (item.w != 0.0f) ? item.w : static_cast<float>(item.pix_w);
			const float h = (item.h != 0.0f) ? item.h : static_cast<float>(item.pix_h);
			ctx.draw_pixels(item.pixels, item.pix_w, item.pix_h, item.x, item.y, w, h);
		}
	}
	std::memcpy(m_buffer.data(), ctx.get_buffer(), static_cast<size_t>(bw) * bh * 4);
	m_dirty = false;
}
// ======================================================================
// BOUNDS, CLIPS & MASKS
// ======================================================================
void Canvas2D::shape_bounds(const Shape2D& s, float ox, float oy, float sx, float sy, float db[4], float ub[4]) const {
	float dx0 = 1e30f, dy0 = 1e30f, dx1 = -1e30f, dy1 = -1e30f;
	float ux0 = 1e30f, uy0 = 1e30f, ux1 = -1e30f, uy1 = -1e30f;
	const Transform it = m_transform.inverse();
	auto ext = [&](float x, float y) {
		dx0 = std::min(dx0, x); dx1 = std::max(dx1, x); dy0 = std::min(dy0, y); dy1 = std::max(dy1, y);
		const float ux = it.a * x + it.c * y + it.e, uy = it.b * x + it.d * y + it.f;
		ux0 = std::min(ux0, ux); ux1 = std::max(ux1, ux); uy0 = std::min(uy0, uy); uy1 = std::max(uy1, uy);
	};
	for (const auto& sp : s.fill_subpaths) for (const auto& pt : sp) ext(pt.first * sx + ox, pt.second * sy + oy);
	for (const auto& e : s.stroke_edges) {
		ext(e.x_at_ymin * sx + ox, e.y_min * sy + oy);
		ext((e.x_at_ymin + (e.y_max - e.y_min) * e.inv_slope) * sx + ox, e.y_max * sy + oy);
	}
	if (dx0 > dx1 || dy0 > dy1) { dx0 = dy0 = ux0 = uy0 = 0.0f; dx1 = dy1 = ux1 = uy1 = 0.0f; }
	db[0] = dx0; db[1] = dy0; db[2] = dx1; db[3] = dy1;
	ub[0] = ux0; ub[1] = uy0; ub[2] = ux1; ub[3] = uy1;
}
// SVG 2 §9.2: source-to-destination mapping rectangle. Meet scales uniformly
// to fit inside the viewport and aligns the letterboxed content; Slice scales
// uniformly to cover the viewport and flags the overflow for clipping. None
// keeps the legacy independent x/y stretch (including negative w/h flips).
void Canvas2D::image_fit_rect(float x, float y, float w, float h, float iw, float ih,
	ImageAlign align, ImageFit fit, float rect[4], bool& clip_viewport) {
	clip_viewport = false;
	if (align == ImageAlign::None || !(iw > 0.0f) || !(ih > 0.0f) || w == 0.0f || h == 0.0f) {
		rect[0] = x; rect[1] = y; rect[2] = w; rect[3] = h; return;
	}
	const float vx = std::min(x, x + w), vy = std::min(y, y + h);
	const float vw = std::fabs(w), vh = std::fabs(h);
	const float sx = vw / iw, sy = vh / ih;
	const float s = (fit == ImageFit::Slice) ? std::max(sx, sy) : std::min(sx, sy);
	const int ai = static_cast<int>(align);            // 1..9, same layout as Marker::Align
	const float ax = static_cast<float>((ai - 1) / 3) * 0.5f;
	const float ay = static_cast<float>((ai - 1) % 3) * 0.5f;
	rect[0] = vx + (vw - iw * s) * ax; rect[1] = vy + (vh - ih * s) * ay;
	rect[2] = iw * s; rect[3] = ih * s;
	clip_viewport = (fit == ImageFit::Slice);
}
void Canvas2D::image_bounds(float x, float y, float w, float h, float db[4], float ub[4],
	ImageAlign align, ImageFit fit, float iw, float ih) const {
	float rect[4]; bool clip_vp = false;
	image_fit_rect(x, y, w, h, iw, ih, align, fit, rect, clip_vp);
	const float vx = std::min(x, x + w), vy = std::min(y, y + h), vw = std::fabs(w), vh = std::fabs(h);
	// Device bounds: the content rect (Meet/None) or the viewport (Slice crop).
	const float bx = clip_vp ? vx : rect[0], by = clip_vp ? vy : rect[1];
	const float bw = clip_vp ? vw : rect[2], bh = clip_vp ? vh : rect[3];
	float dx0 = 1e30f, dy0 = 1e30f, dx1 = -1e30f, dy1 = -1e30f;
	for (int i = 0; i < 4; ++i) {
		float px = bx + ((i == 1 || i == 2) ? bw : 0.0f), py = by + ((i >= 2) ? bh : 0.0f);
		m_transform.apply(px, py);
		dx0 = std::min(dx0, px); dx1 = std::max(dx1, px); dy0 = std::min(dy0, py); dy1 = std::max(dy1, py);
	}
	db[0] = dx0; db[1] = dy0; db[2] = dx1; db[3] = dy1;
	// User bounds: the SVG <image> element bbox is always its viewport, even
	// when Meet letterboxes the content (OBB masks/clips/filters resolve to it).
	ub[0] = vx; ub[1] = vy; ub[2] = vx + vw; ub[3] = vy + vh;
}
void Canvas2D::clip_device_bounds(const ClipPath* cp, const float ub[4], float b[4], int depth) const {
	float x0 = 1e30f, y0 = 1e30f, x1 = -1e30f, y1 = -1e30f;
	if (cp && depth <= CLIP_MAX_DEPTH) {
		Transform ct = m_transform; ct.multiply(cp->transform());
		if (cp->units() == ClipPath::Units::ObjectBoundingBox) {
			const float uw = (ub[2] > ub[0]) ? (ub[2] - ub[0]) : 1.0f;
			const float uh = (ub[3] > ub[1]) ? (ub[3] - ub[1]) : 1.0f;
			ct.multiply(Transform(uw, 0.0f, 0.0f, uh, ub[0], ub[1]));
		}
		const float ex = std::sqrt(ct.a * ct.a + ct.c * ct.c);
		const float ey = std::sqrt(ct.b * ct.b + ct.d * ct.d);
		auto ext = [&](float x, float y) {
			ct.apply(x, y); x0 = std::min(x0, x); x1 = std::max(x1, x); y0 = std::min(y0, y); y1 = std::max(y1, y);
		};
		for (const auto& item : cp->items()) {
			if (!item.shape) continue;
			for (const auto& c : item.shape->commands) {
				if (c.type == 5) {
					const float r = std::fabs(c.x2); float cx = c.x1, cy = c.y1; ct.apply(cx, cy);
					x0 = std::min(x0, cx - r * ex); x1 = std::max(x1, cx + r * ex);
					y0 = std::min(y0, cy - r * ey); y1 = std::max(y1, cy + r * ey);
				} else {
					ext(c.x1, c.y1);
					if (c.type == 2 || c.type == 3) ext(c.x2, c.y2);
					if (c.type == 3) ext(c.x3, c.y3);
				}
			}
		}
		if (const ClipPath* par = cp->clip_path()) {
			float pb[4]; clip_device_bounds(par, ub, pb, depth + 1);
			x0 = std::max(x0, pb[0]); y0 = std::max(y0, pb[1]); x1 = std::min(x1, pb[2]); y1 = std::min(y1, pb[3]);
		}
	}
	b[0] = x0; b[1] = y0; b[2] = x1; b[3] = y1;
}
void Canvas2D::clip_union(ClipPath* cp, int bx0, int by0, int bw, int bh, const float ub[4], uint8_t* out, int depth) {
	if (!cp || depth > CLIP_MAX_DEPTH) return;
	Transform ct = m_transform; ct.multiply(cp->transform());
	if (cp->units() == ClipPath::Units::ObjectBoundingBox) {
		const float uw = (ub[2] > ub[0]) ? (ub[2] - ub[0]) : 1.0f;
		const float uh = (ub[3] > ub[1]) ? (ub[3] - ub[1]) : 1.0f;
		ct.multiply(Transform(uw, 0.0f, 0.0f, uh, ub[0], ub[1]));
	}
	const int s_tw = m_tw, s_th = m_th, s_ox = m_tox, s_oy = m_toy;
	m_tw = bw; m_th = bh; m_tox = bx0; m_toy = by0;
	const size_t n = static_cast<size_t>(bw) * static_cast<size_t>(bh);
	for (const auto& item : cp->items()) {
		if (!item.shape) continue;
		Shape2D s = prepare_shape(*item.shape, ct, false, false);
		m_edges.clear();
		for (const auto& sp : s.fill_subpaths) {
			const size_t np = sp.size(); if (np < 2) continue;
			for (size_t i = 0; i < np; ++i) {
				const auto& p = sp[i]; const auto& q = sp[i + 1 == np ? 0 : i + 1];
				add_edge(p.first, p.second, q.first, q.second, 1);
			}
		}
		if (m_edges.empty()) continue;
		m_clip_tmp.assign(n, 0u);
		raster_coverage(m_clip_tmp.data(), item.rule == ClipPath::Rule::EvenOdd);
		const uint8_t* tmp = m_clip_tmp.data();
		for (size_t i = 0; i < n; ++i) if (tmp[i] > out[i]) out[i] = tmp[i];
	}
	m_tw = s_tw; m_th = s_th; m_tox = s_ox; m_toy = s_oy;
	if (ClipPath* par = cp->clip_path()) {
		std::vector<uint8_t> pv(n, 0u);
		clip_union(par, bx0, by0, bw, bh, ub, pv.data(), depth + 1);
		for (size_t i = 0; i < n; ++i) out[i] = static_cast<uint8_t>((out[i] * pv[i] + 127u) / 255u);
	}
}
// ----------------------------------------------------------------------
// Clip coverage cache. Coverage in device space depends only on the clip
// chain's content + the CTM (plus the object bbox for OBB clips), NOT on
// the draw's bbox -- so rasterize once over the full canvas and copy the
// sub-rect per draw. The signature hashes the actual path commands (clip
// objects are often stack-allocated and rebuilt at the same address every
// frame, so pointer identity alone is not a safe key).
// ----------------------------------------------------------------------
uint64_t Canvas2D::clip_signature(const ClipPath* cp, bool& obb) const {
	obb = false;
	uint64_t h = 1469598103934665603ull;
	auto hu = [&](uint64_t v) { h ^= v; h *= 0x100000001b3ull; };
	auto hf = [&](float v) { uint32_t u; std::memcpy(&u, &v, 4); hu(u); };
	hu(static_cast<uint64_t>(m_stroke_curve_steps));   // affects curve flattening
	int depth = 0;
	for (const ClipPath* p = cp; p && depth <= CLIP_MAX_DEPTH; p = p->clip_path(), ++depth) {
		hu(static_cast<uint64_t>(reinterpret_cast<uintptr_t>(p)));
		hu(static_cast<uint64_t>(p->units()));
		if (p->units() == ClipPath::Units::ObjectBoundingBox) obb = true;
		const Transform& t = p->transform();
		hf(t.a); hf(t.b); hf(t.c); hf(t.d); hf(t.e); hf(t.f);
		for (const auto& item : p->items()) {
			hu(static_cast<uint64_t>(item.rule));
			if (!item.shape) continue;
			hu(static_cast<uint64_t>(item.shape->commands.size()));
			for (const auto& c : item.shape->commands) {
				hu(static_cast<uint64_t>(c.type));
				hf(c.x1); hf(c.y1); hf(c.x2); hf(c.y2); hf(c.x3); hf(c.y3);
			}
		}
	}
	return h;
}
void Canvas2D::clip_coverage_cached(ClipPath* cp, int bx0, int by0, int bw, int bh, const float ub[4], uint8_t* out) {
	bool obb = false;
	const uint64_t sig = clip_signature(cp, obb);
	const Transform& t = m_transform;
	const bool hit = m_clip_cache_valid && m_clip_cache_sig == sig && m_clip_cache_obb == obb &&
	t.a == m_clip_cache_t.a && t.b == m_clip_cache_t.b && t.c == m_clip_cache_t.c &&
	t.d == m_clip_cache_t.d && t.e == m_clip_cache_t.e && t.f == m_clip_cache_t.f &&
	(!obb || (ub[0] == m_clip_cache_ub[0] && ub[1] == m_clip_cache_ub[1] &&
			ub[2] == m_clip_cache_ub[2] && ub[3] == m_clip_cache_ub[3]));
	if (!hit) {
		m_clip_cache.assign(static_cast<size_t>(width) * height, 0u);
		clip_union(cp, 0, 0, width, height, ub, m_clip_cache.data(), 0);
		m_clip_cache_sig = sig; m_clip_cache_t = t; m_clip_cache_obb = obb;
		if (obb) { m_clip_cache_ub[0] = ub[0]; m_clip_cache_ub[1] = ub[1]; m_clip_cache_ub[2] = ub[2]; m_clip_cache_ub[3] = ub[3]; }
		m_clip_cache_valid = true;
	}
	// Copy the draw's sub-rect out of the cached full-canvas coverage.
	const uint8_t* cache = m_clip_cache.data();
	for (int y = 0; y < bh; ++y) {
		uint8_t* dst = out + static_cast<size_t>(y) * bw;
		const int gy = by0 + y;
		if (gy < 0 || gy >= height) { std::fill(dst, dst + bw, 0u); continue; }
		const uint8_t* src = cache + static_cast<size_t>(gy) * width;
		int x = 0;
		for (; x < bw && bx0 + x < 0; ++x) dst[x] = 0u;
		const int run = std::min(bw - x, width - (bx0 + x));
		if (run > 0) { std::memcpy(dst + x, src + (bx0 + x), static_cast<size_t>(run)); x += run; }
		for (; x < bw; ++x) dst[x] = 0u;
	}
}
void Canvas2D::render_mask_content(Mask* mk, int bx0, int by0, int bw, int bh, const float ub[4]) {
	const Transform saved_t = m_transform; const BlendMode saved_b = m_blend_mode;
	const bool saved_shadow = m_shadow_enabled; Mask* saved_mask = m_mask; ClipPath* saved_clip = m_clip;
	const float saved_ga = m_global_alpha;
	m_mask = nullptr; m_clip = nullptr; m_blend_mode = BlendMode::Normal; m_shadow_enabled = false;
	// Mask content is an independent render: the context globalAlpha applies
	// once, to the masked element (the layer), never to the mask values.
	m_global_alpha = 1.0f;
	Transform ct = m_transform; ct.multiply(mk->transform());
	if (mk->content_units() == Mask::Units::ObjectBoundingBox) {
		const float uw = (ub[2] > ub[0]) ? (ub[2] - ub[0]) : 1.0f;
		const float uh = (ub[3] > ub[1]) ? (ub[3] - ub[1]) : 1.0f;
		ct.multiply(Transform(uw, 0.0f, 0.0f, uh, ub[0], ub[1]));
	}
	m_transform = ct; m_inv_dirty = true;
	set_target(m_mask_buf.data(), bw, bh, bx0, by0);
	for (const auto& item : mk->items()) {
		if (item.shape) {
			const bool ds = item.stroke.is_visible() && item.shape->line_width > 0.0f;
			Shape2D s = prepare_shape(*item.shape, ct, ds, false);
			draw_shape(s, item.fill, item.stroke);
		} else if (item.image) {
			const int iw = item.image->getWidth(), ih = item.image->getHeight();
			if (iw <= 0 || ih <= 0) continue;
			const float w = (item.w != 0.0f) ? item.w : static_cast<float>(iw);
			const float h = (item.h != 0.0f) ? item.h : static_cast<float>(ih);
			draw_pixels_impl(item.image->getData(), iw, ih, item.image->getChannels(), item.x, item.y, w, h);
		} else if (item.pixels) {
			const float w = (item.w != 0.0f) ? item.w : static_cast<float>(item.pix_w);
			const float h = (item.h != 0.0f) ? item.h : static_cast<float>(item.pix_h);
			draw_pixels_impl(reinterpret_cast<const uint8_t*>(item.pixels), item.pix_w, item.pix_h, 4, item.x, item.y, w, h);
		}
	}
	reset_target();
	m_transform = saved_t; m_inv_dirty = true;
	m_blend_mode = saved_b; m_shadow_enabled = saved_shadow; m_mask = saved_mask; m_clip = saved_clip;
	m_global_alpha = saved_ga;
}
// ======================================================================
// LAYERED DRAWING ORCHESTRATOR
// ======================================================================
template <class F>
void Canvas2D::draw_layered(const float db[4], const float ub[4], F&& draw_fn) {
	ClipPath* cp = m_clip; Mask* mk = m_mask; Filter* fl = filtered() ? m_filter : nullptr;
	const CompositeOp op = m_composite_op; const bool comp = (op != CompositeOp::SourceOver);
	if (!cp && !mk && !comp && !fl) { draw_fn(); return; }
	if (comp && op == CompositeOp::Clear) { std::fill(m_tbuf, m_tbuf + static_cast<size_t>(m_tw) * m_th, 0u); return; }
	if (!comp && cp && cp->empty()) return;
	if (!comp && mk && mk->empty()) return;
	float cx0 = static_cast<float>(m_tox), cy0 = static_cast<float>(m_toy);
	float cx1 = static_cast<float>(m_tox + m_tw), cy1 = static_cast<float>(m_toy + m_th);
	float fb[4] = {0.0f, 0.0f, 0.0f, 0.0f};
	if (fl) filter_device_bounds(*fl, ub, fb);
	if (!comp && !fl) {
		if (mk && (mk->units() == Mask::Units::ObjectBoundingBox || mk->has_region())) {
			float rx, ry, rw, rh;
			if (mk->units() == Mask::Units::ObjectBoundingBox) {
				const float uw = (ub[2] > ub[0]) ? (ub[2] - ub[0]) : 1.0f;
				const float uh = (ub[3] > ub[1]) ? (ub[3] - ub[1]) : 1.0f;
				rx = ub[0] + mk->region_x() * uw; ry = ub[1] + mk->region_y() * uh;
				rw = mk->region_w() * uw;         rh = mk->region_h() * uh;
			} else { rx = mk->region_x(); ry = mk->region_y(); rw = mk->region_w(); rh = mk->region_h(); }
			Transform rt = m_transform; rt.multiply(mk->transform());
			float qx0 = 1e30f, qy0 = 1e30f, qx1 = -1e30f, qy1 = -1e30f;
			for (int i = 0; i < 4; ++i) {
				float px = rx + ((i == 1 || i == 2) ? rw : 0.0f), py = ry + ((i >= 2) ? rh : 0.0f);
				rt.apply(px, py); qx0 = std::min(qx0, px); qx1 = std::max(qx1, px); qy0 = std::min(qy0, py); qy1 = std::max(qy1, py);
			}
			cx0 = std::max(cx0, qx0); cy0 = std::max(cy0, qy0); cx1 = std::min(cx1, qx1); cy1 = std::min(cy1, qy1);
		}
		if (cp) {
			float cb[4]; clip_device_bounds(cp, ub, cb);
			cx0 = std::max(cx0, cb[0]); cy0 = std::max(cy0, cb[1]); cx1 = std::min(cx1, cb[2]); cy1 = std::min(cy1, cb[3]);
		}
	}
	int bx0, by0, bx1, by1;
	if (comp) { bx0 = m_tox; by0 = m_toy; bx1 = m_tox + m_tw; by1 = m_toy + m_th; }
	else if (fl) {
		bx0 = static_cast<int>(std::floor(std::max(cx0, fb[0]))); by0 = static_cast<int>(std::floor(std::max(cy0, fb[1])));
		bx1 = static_cast<int>(std::ceil(std::min(cx1, fb[2]))); by1 = static_cast<int>(std::ceil(std::min(cy1, fb[3])));
	} else {
		bx0 = static_cast<int>(std::floor(std::max(cx0, db[0]))); by0 = static_cast<int>(std::floor(std::max(cy0, db[1])));
		bx1 = static_cast<int>(std::ceil(std::min(cx1, db[2]))); by1 = static_cast<int>(std::ceil(std::min(cy1, db[3])));
	}
	if (bx0 >= bx1 || by0 >= by1) return;
	const int bw = bx1 - bx0, bh = by1 - by0; const size_t n = static_cast<size_t>(bw) * static_cast<size_t>(bh);
	m_layer.assign(n, 0u); if (mk) m_mask_buf.assign(n, 0u); if (cp) m_clip_cov.assign(n, 0u);
	m_clip = nullptr; m_mask = nullptr; m_filter = nullptr;
	const BlendMode saved_blend = m_blend_mode;
	if (comp) { m_blend_mode = BlendMode::Normal; m_composite_op = CompositeOp::SourceOver; }
	set_target(m_layer.data(), bw, bh, bx0, by0); draw_fn(); reset_target();
	m_clip = cp; m_mask = mk; m_filter = fl;
	if (fl) {
		if (!comp) { fl->apply(m_layer.data(), bw, bh); }
		else {
			const int rx0 = std::max(bx0, static_cast<int>(std::floor(fb[0])));
			const int ry0 = std::max(by0, static_cast<int>(std::floor(fb[1])));
			const int rx1 = std::min(bx1, static_cast<int>(std::ceil(fb[2])));
			const int ry1 = std::min(by1, static_cast<int>(std::ceil(fb[3])));
			uint32_t* layer = m_layer.data();
			if (rx0 >= rx1 || ry0 >= ry1) { std::fill(layer, layer + n, 0u); }
			else {
				const int rw = rx1 - rx0, rh = ry1 - ry0;
				std::vector<uint32_t> tmp(static_cast<size_t>(rw) * rh);
				for (int yy = 0; yy < rh; ++yy)
				std::memcpy(tmp.data() + static_cast<size_t>(yy) * rw, layer + static_cast<size_t>(ry0 + yy - by0) * bw + (rx0 - bx0), static_cast<size_t>(rw) * 4);
				fl->apply(tmp.data(), rw, rh);
				for (int yy = 0; yy < bh; ++yy) {
					for (int xx = 0; xx < bw; ++xx) {
						const int gx = bx0 + xx, gy = by0 + yy;
						layer[static_cast<size_t>(yy) * bw + xx] = (gx >= rx0 && gx < rx1 && gy >= ry0 && gy < ry1) ? tmp[static_cast<size_t>(gy - ry0) * rw + (gx - rx0)] : 0u;
					}
				}
			}
		}
	}
	if (mk) render_mask_content(mk, bx0, by0, bw, bh, ub);
	if (cp) clip_coverage_cached(cp, bx0, by0, bw, bh, ub, m_clip_cov.data());
	if (comp) { m_blend_mode = saved_blend; m_composite_op = op; }
	const Mask::Type mt = mk ? mk->effective_type() : Mask::Type::Alpha;
	uint32_t* layer = m_layer.data(); const uint32_t* mb = mk ? m_mask_buf.data() : nullptr; const uint8_t* cv = cp ? m_clip_cov.data() : nullptr;
	for (size_t i = 0; i < n; ++i) {
		const uint32_t c = layer[i]; const uint32_t a = c >> 24; if (a == 0) continue;
		uint32_t f = 255;
		if (mb) f = mk->value(mb[i], mt);
		if (cv) f = (f * cv[i] + 127u) / 255u;
		if (f == 255) continue;
		layer[i] = (((a * f + 127u) / 255u) << 24) | (c & 0x00FFFFFFu);
	}
	if (comp) composite_op_buffer(layer, bw, bh, bx0, by0, op, saved_blend);
	else composite_buffer(layer, bw, bh, bx0, by0);
}
// ======================================================================
// SHAPE / PIXEL DRAW IMPLEMENTATIONS
// ======================================================================
void Canvas2D::draw_shape_impl(const Shape2D& shape, const Paint& fill_paint, const Paint& stroke_paint, float offset_x, float offset_y, float scale_x, float scale_y) {
	float obj_x = 0.0f, obj_y = 0.0f, obj_w = 1.0f, obj_h = 1.0f;
	if (fill_paint.type == Paint::PATTERN || stroke_paint.type == Paint::PATTERN) {
		float mnx, mny, mxx, mxy; raw_extent(shape, mnx, mny, mxx, mxy);
		obj_x = (mnx < mxx) ? mnx : 0.0f; obj_y = (mny < mxy) ? mny : 0.0f;
		obj_w = (mxx > mnx) ? (mxx - mnx) : 1.0f; obj_h = (mxy > mny) ? (mxy - mny) : 1.0f;
		if (fill_paint.type == Paint::PATTERN && fill_paint.pattern) fill_paint.pattern->prepare(obj_x, obj_y, obj_w, obj_h);
		if (stroke_paint.type == Paint::PATTERN && stroke_paint.pattern) stroke_paint.pattern->prepare(obj_x, obj_y, obj_w, obj_h);
	}
	if (!shape.fill_subpaths.empty() && fill_paint.is_visible()) {
		const bool even_odd = (shape.fill_rule_set ? shape.fill_rule : m_fill_rule) == FillRule::EvenOdd;
		m_edges.clear();
		for (const auto& sp : shape.fill_subpaths) {
			const size_t n = sp.size(); if (n < 2) continue;
			for (size_t i = 0; i < n; ++i) {
				const auto& p = sp[i]; const auto& q = sp[i + 1 == n ? 0 : i + 1];
				add_edge(p.first * scale_x + offset_x, p.second * scale_y + offset_y, q.first * scale_x + offset_x, q.second * scale_y + offset_y, 1);
			}
		}
		if (!m_edges.empty()) raster_edges(fill_paint, even_odd, obj_x, obj_y, obj_w, obj_h);
	}
	if (!shape.stroke_edges.empty() && stroke_paint.is_visible() && shape.line_width > 0.0f) {
		m_edges.clear(); m_edges.reserve(shape.stroke_edges.size());
		for (const auto& e : shape.stroke_edges) {
			add_edge(e.x_at_ymin * scale_x + offset_x, e.y_min * scale_y + offset_y,
				(e.x_at_ymin + (e.y_max - e.y_min) * e.inv_slope) * scale_x + offset_x, e.y_max * scale_y + offset_y, e.dir);
		}
		if (!m_edges.empty()) raster_edges(stroke_paint, false, obj_x, obj_y, obj_w, obj_h);
	}
}
// ======================================================================
// IMAGE RENDERING (SVG 2 §9.2)
// preserveAspectRatio (align + meet/slice) and image smoothing:
//   * imageSmoothingEnabled = false -> nearest neighbour (exact source px)
//   * Low    -> bilinear (premultiplied, fixed point; legacy default path)
//   * Medium -> bicubic Catmull-Rom (premultiplied, float)
//   * High   -> exact box area-average over the source-space footprint of
//               each device pixel when minifying; bicubic when magnifying.
//               Extreme minification (>64 source px per axis) falls back to
//               stratified box sampling so the cost stays bounded.
// Slice clips to the viewport in USER space, so the crop follows the CTM.
// globalAlpha scales the sampled source alpha before blending (once).
// ======================================================================
void Canvas2D::draw_pixels_impl(const uint8_t* src, int iw, int ih, int ch, float x, float y, float w, float h, ImageAlign align, ImageFit fit) {
	if (!src || iw <= 0 || ih <= 0 || ch <= 0 || w == 0.0f || h == 0.0f || !(m_global_alpha > 0.0f)) return;
	float rect[4]; bool clip_vp = false;
	image_fit_rect(x, y, w, h, static_cast<float>(iw), static_cast<float>(ih), align, fit, rect, clip_vp);
	const float rx = rect[0], ry = rect[1], rw = rect[2], rh = rect[3];
	if (rw == 0.0f || rh == 0.0f) return;
	const float vx = std::min(x, x + w), vy = std::min(y, y + h), vw = std::fabs(w), vh = std::fabs(h);
	const Transform& T = m_transform;
	float min_x = 1e30f, max_x = -1e30f, min_y = 1e30f, max_y = -1e30f;
	for (int i = 0; i < 4; ++i) {
		float px = rx + ((i == 1 || i == 2) ? rw : 0.0f), py = ry + ((i >= 2) ? rh : 0.0f);
		T.apply(px, py);
		min_x = std::min(min_x, px); max_x = std::max(max_x, px); min_y = std::min(min_y, py); max_y = std::max(max_y, py);
	}
	const int x0 = std::max(m_tox, (int)std::floor(min_x)), x1 = std::min(m_tox + m_tw, (int)std::ceil(max_x));
	const int y0 = std::max(m_toy, (int)std::floor(min_y)), y1 = std::min(m_toy + m_th, (int)std::ceil(max_y));
	if (x0 >= x1 || y0 >= y1) return;
	if (!T.invertible()) return;
	const Transform it = T.inverse();                  // device -> user space
	const float inv_rw = 1.0f / rw, inv_rh = 1.0f / rh;  // user -> content [0,1]
	const float fiw = static_cast<float>(iw), fih = static_cast<float>(ih);
	int mode = !m_image_smoothing ? 0
	: (m_image_smoothing_quality == ImageSmoothingQuality::Low ? 1
		: (m_image_smoothing_quality == ImageSmoothingQuality::Medium ? 2 : 3));
	// Source-space footprint of one device pixel (axis-aligned bound of the
	// inverse-mapped pixel square); constant across the draw for affine CTMs.
	const float fw = (std::fabs(it.a) + std::fabs(it.c)) * fiw * std::fabs(inv_rw);
	const float fh = (std::fabs(it.b) + std::fabs(it.d)) * fih * std::fabs(inv_rh);
	if (mode == 3 && !(fw > 1.0f || fh > 1.0f)) mode = 2;   // magnifying -> bicubic
	const size_t stride = static_cast<size_t>(iw) * ch;
	auto fetch = [&](int sx, int sy, int* o) {
		sx = sx < 0 ? 0 : (sx >= iw ? iw - 1 : sx); sy = sy < 0 ? 0 : (sy >= ih ? ih - 1 : sy);
		const uint8_t* p = src + sy * stride + static_cast<size_t>(sx) * ch;
		const int r = p[0], g = ch > 2 ? p[1] : r, b = ch > 2 ? p[2] : r;
		const int a = (ch == 4) ? p[3] : (ch == 2 ? p[1] : 255);
		o[0] = r * a; o[1] = g * a; o[2] = b * a; o[3] = a * 255;
	};
	auto fetchf = [&](int sx, int sy, float* o) {
		sx = sx < 0 ? 0 : (sx >= iw ? iw - 1 : sx); sy = sy < 0 ? 0 : (sy >= ih ? ih - 1 : sy);
		const uint8_t* p = src + static_cast<size_t>(sy) * stride + static_cast<size_t>(sx) * ch;
		const float r = p[0], g = ch > 2 ? p[1] : r, b = ch > 2 ? p[2] : r;
		const float a = (ch == 4) ? p[3] : (ch == 2 ? p[1] : 255.0f);
		const float an = a * (1.0f / 255.0f);
		o[0] = r * an; o[1] = g * an; o[2] = b * an; o[3] = a;
	};
	auto packf = [](const float* o) -> uint32_t {
		float af = o[3]; if (!(af > 0.0f)) return 0u; if (af > 255.0f) af = 255.0f;
		const uint32_t ai = static_cast<uint32_t>(af + 0.5f); if (ai == 0u) return 0u;
		const float inv = 255.0f / af;
		auto q = [&](float v) -> uint32_t {
			v *= inv; if (!(v > 0.0f)) return 0u; if (v >= 255.0f) return 255u;
			return static_cast<uint32_t>(v + 0.5f);
		};
		return (ai << 24) | (q(o[2]) << 16) | (q(o[1]) << 8) | q(o[0]);
	};
	auto cubic_w = [](float t, float* wts) {   // Catmull-Rom, taps at -1..+2
		const float t2 = t * t, t3 = t2 * t;
		wts[0] = -0.5f * t + t2 - 0.5f * t3;
		wts[1] = 1.0f - 2.5f * t2 + 1.5f * t3;
		wts[2] = 0.5f * t + 2.0f * t2 - 1.5f * t3;
		wts[3] = -0.5f * t2 + 0.5f * t3;
	};
	for (int py = y0; py < y1; ++py) {
		uint32_t* dst = m_tbuf + static_cast<size_t>(py - m_toy) * m_tw;
		const float fy = py + 0.5f, fx0 = x0 + 0.5f;
		float ux = it.a * fx0 + it.c * fy + it.e, uy = it.b * fx0 + it.d * fy + it.f;
		for (int px = x0; px < x1; ++px, ux += it.a, uy += it.b) {
			if (clip_vp && (ux < vx || ux >= vx + vw || uy < vy || uy >= vy + vh)) continue;
			const float u = (ux - rx) * inv_rw, v = (uy - ry) * inv_rh;
			if (u < 0.0f || u >= 1.0f || v < 0.0f || v >= 1.0f) continue;
			uint32_t col = 0, a = 0;
			if (mode == 0) {
				// Nearest neighbour: exact straight (non-premultiplied) source pixel.
				int sx = (int)(u * fiw), sy = (int)(v * fih);
				sx = sx < 0 ? 0 : (sx >= iw ? iw - 1 : sx); sy = sy < 0 ? 0 : (sy >= ih ? ih - 1 : sy);
				const uint8_t* p = src + static_cast<size_t>(sy) * stride + static_cast<size_t>(sx) * ch;
				const uint32_t r = p[0], g = ch > 2 ? p[1] : r, b = ch > 2 ? p[2] : r;
				a = (ch == 4) ? p[3] : (ch == 2 ? p[1] : 255);
				col = (a << 24) | (b << 16) | (g << 8) | r;
			} else if (mode == 1) {
				// Bilinear, premultiplied fixed point (legacy default path, unchanged).
				const float su = u * fiw - 0.5f, sv = v * fih - 0.5f;
				const int ix = (int)std::floor(su), iy = (int)std::floor(sv);
				const int wx = (int)((su - ix) * 256.0f), wy = (int)((sv - iy) * 256.0f);
				int c00[4], c10[4], c01[4], c11[4], o[4];
				fetch(ix, iy, c00);     fetch(ix + 1, iy, c10);
				fetch(ix, iy + 1, c01); fetch(ix + 1, iy + 1, c11);
				for (int k = 0; k < 4; ++k) {
					const int top = (c00[k] * (256 - wx) + c10[k] * wx) >> 8;
					const int bot = (c01[k] * (256 - wx) + c11[k] * wx) >> 8;
					o[k] = (top * (256 - wy) + bot * wy) >> 8;
				}
				a = (uint32_t)((o[3] + 127) / 255); if (a == 0) continue;
				uint32_t r, g, b;
				if (o[3] >= 65025) { r = (o[0] + 127) / 255; g = (o[1] + 127) / 255; b = (o[2] + 127) / 255; }
				else {
					const float inv = 255.0f / o[3];
					r = std::min(255, (int)(o[0] * inv + 0.5f));
					g = std::min(255, (int)(o[1] * inv + 0.5f));
					b = std::min(255, (int)(o[2] * inv + 0.5f));
				}
				col = (a << 24) | (b << 16) | (g << 8) | r;
			} else if (mode == 2) {
				// Bicubic Catmull-Rom, premultiplied float, clamped taps.
				const float su = u * fiw - 0.5f, sv = v * fih - 0.5f;
				const int ix = (int)std::floor(su), iy = (int)std::floor(sv);
				float wx[4], wy[4]; cubic_w(su - ix, wx); cubic_w(sv - iy, wy);
				float acc[4] = {0.0f, 0.0f, 0.0f, 0.0f};
				for (int j = 0; j < 4; ++j) {
					float rowc[4] = {0.0f, 0.0f, 0.0f, 0.0f}, t4[4];
					for (int i = 0; i < 4; ++i) {
						fetchf(ix - 1 + i, iy - 1 + j, t4);
						for (int k = 0; k < 4; ++k) rowc[k] += t4[k] * wx[i];
					}
					for (int k = 0; k < 4; ++k) acc[k] += rowc[k] * wy[j];
				}
				col = packf(acc); a = col >> 24;
			} else {
				// High-quality minification: integrate premultiplied colour over the
				// source pixel footprint (exact box overlap), clamped at image edges.
				const float cxp = u * fiw, cyp = v * fih;
				const float ax0 = std::max(0.0f, cxp - fw * 0.5f), ax1 = std::min(fiw, cxp + fw * 0.5f);
				const float ay0 = std::max(0.0f, cyp - fh * 0.5f), ay1 = std::min(fih, cyp + fh * 0.5f);
				if (ax1 <= ax0 || ay1 <= ay0) continue;
				const int i0 = (int)std::floor(ax0), i1 = (int)std::ceil(ax1);
				const int j0 = (int)std::floor(ay0), j1 = (int)std::ceil(ay1);
				float acc[4] = {0.0f, 0.0f, 0.0f, 0.0f}, total = 0.0f;
				if (i1 - i0 <= 64 && j1 - j0 <= 64) {
					for (int j = j0; j < j1; ++j) {
						const float wy = std::min(ay1, j + 1.0f) - std::max(ay0, static_cast<float>(j));
						for (int i = i0; i < i1; ++i) {
							const float wx = std::min(ax1, i + 1.0f) - std::max(ax0, static_cast<float>(i));
							const float wgt = wx * wy; if (wgt <= 0.0f) continue;
							float t4[4]; fetchf(i, j, t4);
							for (int k = 0; k < 4; ++k) acc[k] += t4[k] * wgt;
							total += wgt;
						}
					}
				} else {
					// Bounded fallback: stratified point sampling across the footprint.
					const int mx = std::min(i1 - i0, 64), my = std::min(j1 - j0, 64);
					const float dxs = (ax1 - ax0) / mx, dys = (ay1 - ay0) / my;
					for (int j = 0; j < my; ++j) {
						const int sy = (int)(ay0 + (j + 0.5f) * dys);
						for (int i = 0; i < mx; ++i) {
							const int sx = (int)(ax0 + (i + 0.5f) * dxs);
							float t4[4]; fetchf(sx, sy, t4);
							for (int k = 0; k < 4; ++k) acc[k] += t4[k];
							total += 1.0f;
						}
					}
				}
				if (total <= 0.0f) continue;
				const float invw = 1.0f / total;
				for (int k = 0; k < 4; ++k) acc[k] *= invw;
				col = packf(acc); a = col >> 24;
			}
			if (a == 0) continue;
			// globalAlpha: scale the sampled source alpha once, before blending.
			const uint32_t fa = (m_global_alpha >= 1.0f) ? a
			: static_cast<uint32_t>(static_cast<float>(a) * m_global_alpha + 0.5f);
			if (fa == 0) continue;
			dst[px - m_tox] = blend_core(dst[px - m_tox], col, fa, m_blend_mode);
		}
	}
}
void Canvas2D::draw_with_shadow(const Shape2D& shape, bool do_fill, bool do_stroke) {
	if (shape.fill_subpaths.empty() && shape.stroke_edges.empty()) return;
	float mnx, mny, mxx, mxy; raw_extent(shape, mnx, mny, mxx, mxy);
	if (mnx >= mxx || mny >= mxy) return;
	const int margin = (int)std::ceil(m_shadow_blur * 6.0f) + 2;
	const int bx0 = std::max(m_tox, (int)std::floor(mnx) - margin), by0 = std::max(m_toy, (int)std::floor(mny) - margin);
	const int bx1 = std::min(m_tox + m_tw, (int)std::ceil(mxx) + margin), by1 = std::min(m_toy + m_th, (int)std::ceil(mxy) + margin);
	const int bw = bx1 - bx0, bh = by1 - by0; if (bw <= 0 || bh <= 0) return;
	m_shadow_buf.assign(static_cast<size_t>(bw) * bh, 0u); uint32_t* temp = m_shadow_buf.data();
	const BlendMode saved = m_blend_mode; m_blend_mode = BlendMode::Normal;
	uint32_t* const saved_buf = m_tbuf;
	const int saved_tw = m_tw, saved_th = m_th, saved_ox = m_tox, saved_oy = m_toy;
	set_target(temp, bw, bh, bx0, by0);
	const Paint shadow_paint(m_shadow_color), none(rgba(0, 0, 0, 0));
	draw_shape(shape, do_fill ? shadow_paint : none, do_stroke ? shadow_paint : none);
	set_target(saved_buf, saved_tw, saved_th, saved_ox, saved_oy); m_blend_mode = saved;
	box_blur(temp, bw, bh, (int)std::ceil(m_shadow_blur));
	composite_buffer(temp, bw, bh, bx0 + (int)std::round(m_shadow_dx), by0 + (int)std::round(m_shadow_dy));
	if (do_fill)   draw_shape(shape, m_fill_style, Paint(rgba(0, 0, 0, 0)));
	if (do_stroke) draw_shape(shape, Paint(rgba(0, 0, 0, 0)), m_stroke_style);
}
// ======================================================================
// SHARED DRAW PLUMBING
// ======================================================================
Shape2D Canvas2D::prepare_shape(const Shape2D& shape, const Transform& T, bool do_stroke, bool context_dash, int curve_steps) const {
	Shape2D t; t.commands.reserve(shape.commands.size());
	const float sx = std::sqrt(T.a * T.a + T.b * T.b);
	const float sy = std::sqrt(T.c * T.c + T.d * T.d);
	const float maxs = std::max(std::max(sx, sy), 1e-6f);
	const float tol = 0.05f / maxs;
	constexpr float TWO_PI = 6.28318530717958647692f;
	float px = 0.0f, py = 0.0f, spx = 0.0f, spy = 0.0f; bool has = false;
	auto emit_cmd = [&](const Path2D::Command& c) {
		Path2D::Command o = c; T.apply(o.x1, o.y1);
		if (c.type == 2 || c.type == 3) T.apply(o.x2, o.y2);
		if (c.type == 3) T.apply(o.x3, o.y3);
		t.commands.push_back(o);
	};
	auto emit_pt = [&](int type, float x, float y) {
		Path2D::Command o{type, x, y, 0, 0, 0, 0}; T.apply(o.x1, o.y1); t.commands.push_back(o);
	};
	for (const auto& c : shape.commands) {
		if (c.type == 4) { emit_pt(4, spx, spy); px = spx; py = spy; has = true; continue; }
		if (c.type != 5) {
			emit_cmd(c);
			switch (c.type) {
				case 0: px = spx = c.x1; py = spy = c.y1; has = true; break;
				case 1: px = c.x1; py = c.y1; has = true; break;
				case 2: px = c.x2; py = c.y2; has = true; break;
				case 3: px = c.x3; py = c.y3; has = true; break;
			}
			continue;
		}
		const float acx = c.x1, acy = c.y1, r = c.x2, a0 = c.y2, a1 = c.x3;
		const bool ccw = c.y3 >= 0.5f;
		const float asx = acx + r * std::cos(a0), asy = acy + r * std::sin(a0);
		const float aex = acx + r * std::cos(a1), aey = acy + r * std::sin(a1);
		const bool at_center = has && ((px - acx) * (px - acx) + (py - acy) * (py - acy) < 0.25f);
		if (at_center && !t.commands.empty()) {
			float tx = asx, ty = asy; T.apply(tx, ty);
			Path2D::Command& last = t.commands.back();
			if (last.type == 2) { last.x2 = tx; last.y2 = ty; }
			else if (last.type == 3) { last.x3 = tx; last.y3 = ty; }
			else { last.x1 = tx; last.y1 = ty; }
			spx = asx; spy = asy; px = asx; py = asy;
		} else if (!has) { emit_pt(0, asx, asy); spx = asx; spy = asy; px = asx; py = asy; has = true; }
		else if ((px - asx) * (px - asx) + (py - asy) * (py - asy) > 0.25f) { emit_pt(1, asx, asy); px = asx; py = asy; }
		else { px = asx; py = asy; }
		if (r > 1e-6f) {
			float diff = a1 - a0; const bool full = std::fabs(std::fabs(diff) - TWO_PI) < 1e-4f; float eff = diff;
			if (full) eff = ccw ? -TWO_PI : TWO_PI;
			else if (ccw) { while (eff > 0.0f) eff -= TWO_PI; }
			else { while (eff < 0.0f) eff += TWO_PI; }
			if (eff != 0.0f || full) {
				float da = 2.0f * std::acos(1.0f - std::min(1.0f, tol / r)); if (da < 1e-4f) da = 1e-4f;
				int n = static_cast<int>(std::ceil(std::fabs(eff) / da));
				if (n < 4) n = 4; if (n > 4096) n = 4096;
				const float step = eff / n;
				for (int i = 1; i <= n; ++i) {
					const float ang = a0 + i * step;
					emit_pt(1, acx + r * std::cos(ang), acy + r * std::sin(ang));
				}
			}
		}
		px = aex; py = aey;
	}
	t.line_width = do_stroke ? shape.line_width * T.average_scale() : 0.0f;
	t.line_cap = shape.line_cap; t.line_join = shape.line_join; t.miter_limit = shape.miter_limit;
	t.fill_rule = shape.fill_rule; t.fill_rule_set = shape.fill_rule_set;
	if (do_stroke) {
		const bool shape_dash = !shape.dash_array.empty();
		if (shape_dash || context_dash) {
			const std::vector<float>& dsrc = shape_dash ? shape.dash_array : m_line_dash;
			if (!dsrc.empty()) {
				const float ds = T.average_scale(); t.dash_array = dsrc;
				for (float& v : t.dash_array) v *= ds;
				t.dash_offset = (shape_dash ? shape.dash_offset : m_line_dash_offset) * ds;
			}
		}
	}
	int steps = curve_steps > 0 ? curve_steps : m_stroke_curve_steps;
	{   // device-space flatness: err <= 0.75*M/n^2, M = max |second difference|
		float m2 = 0.0f, cx = 0.0f, cy = 0.0f, sx0 = 0.0f, sy0 = 0.0f;
		for (const auto& c : t.commands) {
			switch (c.type) {
				case 0: cx = sx0 = c.x1; cy = sy0 = c.y1; break;
				case 1: cx = c.x1; cy = c.y1; break;
				case 2: { const float ax = cx - 2 * c.x1 + c.x2, ay = cy - 2 * c.y1 + c.y2;
					m2 = std::max(m2, ax * ax + ay * ay); cx = c.x2; cy = c.y2; break; }
				case 3: { const float ax = cx - 2 * c.x1 + c.x2, ay = cy - 2 * c.y1 + c.y2;
					const float bx = c.x1 - 2 * c.x2 + c.x3, by = c.y1 - 2 * c.y2 + c.y3;
					m2 = std::max(m2, std::max(ax * ax + ay * ay, bx * bx + by * by));
					cx = c.x3; cy = c.y3; break; }
				case 4: cx = sx0; cy = sy0; break;
			}
		}
		const int n = static_cast<int>(std::ceil(std::sqrt(0.75f * std::sqrt(m2) / 0.05f))) + 1;
		if (n < steps) steps = n < 4 ? 4 : n;
	}
	t.compile(steps);
	return t;
}
void Canvas2D::paint_shape(const Shape2D& t, bool do_fill, bool do_stroke) {
	if (m_shadow_enabled) { draw_with_shadow(t, do_fill, do_stroke); return; }
	if (do_fill)   draw_shape(t, m_fill_style, Paint(rgba(0, 0, 0, 0)));
	if (do_stroke) draw_shape(t, Paint(rgba(0, 0, 0, 0)), m_stroke_style);
}
void Canvas2D::emit(const Shape2D& t, bool do_fill, bool do_stroke) {
	if (m_mask || m_clip || filtered() || m_composite_op != CompositeOp::SourceOver) {
		float db[4], ub[4]; shape_bounds(t, 0.0f, 0.0f, 1.0f, 1.0f, db, ub);
		draw_layered(db, ub, [&]() { paint_shape(t, do_fill, do_stroke); }); return;
	}
	paint_shape(t, do_fill, do_stroke);
}
// ======================================================================
// MARKERS
// ======================================================================
void Canvas2D::marker_slots(const Shape2D& shape, std::vector<MarkerSlot>& out) const {
	out.clear(); constexpr float TWO_PI = 6.28318530717958647692f;
	float px = 0.0f, py = 0.0f, spx = 0.0f, spy = 0.0f; bool has = false; size_t sub0 = 0;
	auto unit = [](float& x, float& y) {
		const float l = std::sqrt(x * x + y * y); if (!(l > 1e-9f)) { x = y = 0.0f; return false; }
		x /= l; y /= l; return true;
	};
	auto open_sub = [&](float x, float y) {
		sub0 = out.size(); MarkerSlot s{}; s.x = x; s.y = y; s.end_kind = 1; out.push_back(s);
		spx = px = x; spy = py = y; has = true;
	};
	auto segment = [&](float x, float y, float sx, float sy, float ex, float ey) {
		if (!has) open_sub(px, py);
		const float dx = x - px, dy = y - py;
		const bool ok_s = unit(sx, sy), ok_e = unit(ex, ey);
		if (dx * dx + dy * dy < 1e-10f && !ok_s && !ok_e) return;
		MarkerSlot& prev = out.back();
		if (!prev.has_out && ok_s) { prev.out_x = sx; prev.out_y = sy; prev.has_out = true; }
		prev.end_kind = 0; MarkerSlot s{}; s.x = x; s.y = y; s.end_kind = 2;
		if (ok_e) { s.in_x = ex; s.in_y = ey; s.has_in = true; }
		out.push_back(s); px = x; py = y;
	};
	for (const auto& c : shape.commands) {
		switch (c.type) {
			case 0: open_sub(c.x1, c.y1); break;
			case 1: segment(c.x1, c.y1, c.x1 - px, c.y1 - py, c.x1 - px, c.y1 - py); break;
			case 2: {
				float sx = c.x1 - px, sy = c.y1 - py, ex = c.x2 - c.x1, ey = c.y2 - c.y1;
				if (sx * sx + sy * sy < 1e-12f) { sx = c.x2 - px; sy = c.y2 - py; }
				if (ex * ex + ey * ey < 1e-12f) { ex = c.x2 - px; ey = c.y2 - py; }
				segment(c.x2, c.y2, sx, sy, ex, ey); break;
			}
			case 3: {
				float sx = c.x1 - px, sy = c.y1 - py, ex = c.x3 - c.x2, ey = c.y3 - c.y2;
				if (sx * sx + sy * sy < 1e-12f) { sx = c.x2 - px; sy = c.y2 - py; }
				if (sy * sy + sy * sy < 1e-12f) { sx = c.x3 - px; sy = c.y3 - py; }
				if (ex * ex + ey * ey < 1e-12f) { ex = c.x3 - c.x1; ey = c.y3 - c.y1; }
				if (ex * ex + ey * ey < 1e-12f) { ex = c.x3 - px; ey = c.y3 - py; }
				segment(c.x3, c.y3, sx, sy, ex, ey); break;
			}
			case 4: {
				if (!has || out.empty()) break;
				const float dx = spx - px, dy = spy - py; MarkerSlot first = out[sub0];
				if (dx * dx + dy * dy > 1e-10f) {
					float ux = dx, uy = dy; unit(ux, uy); MarkerSlot& last = out.back();
					if (!last.has_out) { last.out_x = ux; last.out_y = uy; last.has_out = true; }
					first.in_x = ux; first.in_y = uy; first.has_in = true;
				}
				first.end_kind = 0; out[sub0].end_kind = 0; out.push_back(first); px = spx; py = spy; break;
			}
			case 5: {
				const float acx = c.x1, acy = c.y1, r = c.x2, a0 = c.y2, a1 = c.x3;
				const bool ccw = c.y3 >= 0.5f;
				const float asx = acx + r * std::cos(a0), asy = acy + r * std::sin(a0);
				const float aex = acx + r * std::cos(a1), aey = acy + r * std::sin(a1);
				const bool at_center = has && ((px - acx) * (px - acx) + (py - acy) * (py - acy) < 0.25f);
				if (at_center && !out.empty()) {
					out.back().x = asx; out.back().y = asy;
					if (sub0 + 1 == out.size()) { out[sub0].x = asx; out[sub0].y = asy; }
					spx = asx; spy = asy; px = asx; py = asy;
				} else if (!has) { open_sub(asx, asy); }
				else if ((px - asx) * (px - asx) + (py - asy) * (py - asy) > 0.25f) { segment(asx, asy, asx - px, asy - py, asx - px, asy - py); }
				else { px = asx; py = asy; }
				if (r > 1e-6f) {
					float diff = a1 - a0; const bool full = std::fabs(std::fabs(diff) - TWO_PI) < 1e-4f; float eff = diff;
					if (full) eff = ccw ? -TWO_PI : TWO_PI;
					else if (ccw) { while (eff > 0.0f) eff -= TWO_PI; }
					else { while (eff < 0.0f) eff += TWO_PI; }
					const float sg = (eff < 0.0f) ? -1.0f : 1.0f;
					segment(aex, aey, -std::sin(a0) * sg, std::cos(a0) * sg, -std::sin(a1) * sg, std::cos(a1) * sg);
				}
				px = aex; py = aey; break;
			}
		}
	}
}
void Canvas2D::draw_marker(const Marker& mk, const MarkerSlot& s, bool is_start, float stroke_width) {
	if (mk.empty()) return;
	const float mw = mk.marker_width(), mh = mk.marker_height();
	if (!(mw > 0.0f) || !(mh > 0.0f)) return;
	const float scale = (mk.units() == Marker::Units::StrokeWidth) ? stroke_width : 1.0f;
	if (!(scale > 0.0f) || !std::isfinite(scale)) return;
	float angle = 0.0f;
	if (mk.orient() == Marker::Orient::Angle) { angle = mk.orient_angle() * 0.01745329251994329577f; }
	else {
		float dx = 0.0f, dy = 0.0f;
		if (s.end_kind == 1) { dx = s.has_out ? s.out_x : s.in_x; dy = s.has_out ? s.out_y : s.in_y; }
		else if (s.end_kind == 2) { dx = s.has_in ? s.in_x : s.out_x; dy = s.has_in ? s.in_y : s.out_y; }
		else if (s.has_in && s.has_out) {
			dx = s.in_x + s.out_x; dy = s.in_y + s.out_y;
			if (dx * dx + dy * dy < 1e-12f) { dx = s.out_x; dy = s.out_y; }
		} else if (s.has_out) { dx = s.out_x; dy = s.out_y; }
		else if (s.has_in) { dx = s.in_x; dy = s.in_y; }
		if (dx != 0.0f || dy != 0.0f) angle = std::atan2(dy, dx);
		if (is_start && mk.orient() == Marker::Orient::AutoStartReverse) angle += 3.14159265358979323846f;
	}
	Transform place; place.translate(s.x, s.y); place.rotate(angle); place.scale(scale, scale);
	Transform fit; float fsx = 1.0f, fsy = 1.0f;
	if (mk.has_view_box()) {
		const float* vb = mk.view_box();
		if (vb[2] > 0.0f && vb[3] > 0.0f) {
			float sx = mw / vb[2], sy = mh / vb[3], ax = 0.0f, ay = 0.0f;
			const int ai = static_cast<int>(mk.align());
			if (ai != 0) {
				ax = static_cast<float>((ai - 1) / 3) * 0.5f; ay = static_cast<float>((ai - 1) % 3) * 0.5f;
				const float u = (mk.fit() == Marker::Fit::Slice) ? std::max(sx, sy) : std::min(sx, sy);
				sx = sy = u;
			}
			fsx = sx; fsy = sy;
			fit = Transform(sx, 0.0f, 0.0f, sy, -vb[0] * sx + (mw - vb[2] * sx) * ax, -vb[1] * sy + (mh - vb[3] * sy) * ay);
		}
	}
	Transform ct = m_transform; ct.multiply(place); ct.multiply(fit); ct.translate(-mk.ref_x(), -mk.ref_y());
	ClipPath* saved_clip = m_clip;
	if (!mk.overflow_visible()) {
		const float vx = -mk.ref_x() * fsx, vy = -mk.ref_y() * fsy;
		float x0 = vx, y0 = vy, x1 = vx + mw, y1 = vy, x2 = vx + mw, y2 = vy + mh, x3 = vx, y3 = vy + mh;
		place.apply(x0, y0); place.apply(x1, y1); place.apply(x2, y2); place.apply(x3, y3);
		m_marker_clip_shape.commands.clear();
		m_marker_clip_shape.mt(x0, y0).lt(x1, y1).lt(x2, y2).lt(x3, y3).close();
		m_marker_clip.clear();
		m_marker_clip.set_units(ClipPath::Units::UserSpaceOnUse).set_transform(1, 0, 0, 1, 0, 0);
		m_marker_clip.add(m_marker_clip_shape); m_marker_clip.set_clip_path(saved_clip); m_clip = &m_marker_clip;
	}
	const Paint saved_fill = m_fill_style, saved_stroke = m_stroke_style; const FillRule saved_rule = m_fill_rule;
	m_fill_rule = FillRule::NonZero;
	for (const auto& item : mk.items()) {
		if (!item.shape) continue;
		const Paint f = item.fill_from == Marker::Context::Fill ? saved_fill : (item.fill_from == Marker::Context::Stroke ? saved_stroke : item.fill);
		const Paint st = item.stroke_from == Marker::Context::Fill ? saved_fill : (item.stroke_from == Marker::Context::Stroke ? saved_stroke : item.stroke);
		const bool df = f.is_visible(); const bool ds = st.is_visible() && item.shape->line_width > 0.0f;
		if (!df && !ds) continue;
		Shape2D t = prepare_shape(*item.shape, ct, ds, false);
		m_fill_style = df ? f : Paint(rgba(0, 0, 0, 0)); m_stroke_style = ds ? st : Paint(rgba(0, 0, 0, 0));
		emit(t, df, ds);
	}
	m_fill_style = saved_fill; m_stroke_style = saved_stroke; m_fill_rule = saved_rule; m_clip = saved_clip;
}
void Canvas2D::draw_markers(const Shape2D& shape) {
	if (!m_marker_start && !m_marker_mid && !m_marker_end) return;
	std::vector<MarkerSlot> slots; marker_slots(shape, slots); const size_t n = slots.size();
	if (n == 0) return; const float sw = shape.line_width;
	if (m_marker_start) draw_marker(*m_marker_start, slots.front(), true, sw);
	if (m_marker_mid) for (size_t i = 1; i + 1 < n; ++i) draw_marker(*m_marker_mid, slots[i], false, sw);
	if (m_marker_end) draw_marker(*m_marker_end, slots.back(), false, sw);
}
// ======================================================================
// PUBLIC DRAW ENTRY POINTS
// (text entry points live in canvas2d_text.cpp - SVG 2 §10)
// ======================================================================
Canvas2D& Canvas2D::draw_image(const Image& img, float x, float y) {
	return draw_image(img, x, y, static_cast<float>(img.getWidth()), static_cast<float>(img.getHeight()));
}
Canvas2D& Canvas2D::draw_image(const Image& img, float x, float y, float w, float h, ImageAlign align, ImageFit fit) {
	return draw_pixels(img.getData(), img.getWidth(), img.getHeight(), img.getChannels(), x, y, w, h, align, fit);
}
Canvas2D& Canvas2D::draw_pixels(const uint8_t* src, int iw, int ih, int ch, float x, float y, float w, float h, ImageAlign align, ImageFit fit) {
	if (!src || iw <= 0 || ih <= 0 || ch <= 0 || w == 0.0f || h == 0.0f) return *this;
	if (m_mask || m_clip || filtered() || m_composite_op != CompositeOp::SourceOver) {
		float db[4], ub[4]; image_bounds(x, y, w, h, db, ub, align, fit, static_cast<float>(iw), static_cast<float>(ih));
		draw_layered(db, ub, [&]() { draw_pixels_impl(src, iw, ih, ch, x, y, w, h, align, fit); }); return *this;
	}
	draw_pixels_impl(src, iw, ih, ch, x, y, w, h, align, fit); return *this;
}
Canvas2D& Canvas2D::draw_shape(const Shape2D& shape, const Paint& fill_paint, const Paint& stroke_paint, float offset_x, float offset_y, float scale_x, float scale_y) {
	if (m_mask || m_clip || filtered() || m_composite_op != CompositeOp::SourceOver) {
		float db[4], ub[4]; shape_bounds(shape, offset_x, offset_y, scale_x, scale_y, db, ub);
		draw_layered(db, ub, [&]() { draw_shape_impl(shape, fill_paint, stroke_paint, offset_x, offset_y, scale_x, scale_y); }); return *this;
	}
	draw_shape_impl(shape, fill_paint, stroke_paint, offset_x, offset_y, scale_x, scale_y); return *this;
}
#endif // CANVAS2D_CPP
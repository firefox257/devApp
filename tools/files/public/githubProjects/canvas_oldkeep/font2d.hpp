// ./font2d.hpp
#ifndef FONT2D_HPP
#define FONT2D_HPP

#include "font.hpp"
#include "shape2d.hpp"
#include "canvas2d.hpp"
#include <unordered_map>

class Font2D {
public:
	struct CharMetrics { float advance, width, ascent, descent; };
	struct StringMetrics { float width, ascent, descent, line_gap; };

	Font2D(Font* font, float line_width, Shape2D::LineCap cap, Shape2D::LineJoin join, float miter_limit = 4.0f)
		: m_font(font), m_line_width(line_width), m_line_cap(cap), m_line_join(join), m_miter_limit(miter_limit), m_pixel_height(16.0f) {}

	void set_font(Font* font) {
		if (m_font != font) { m_font = font; m_shape_cache.clear(); }
	}
	Font* get_font() const { return m_font; }

	const Shape2D& get_char_shape(int cp) const {
		auto it = m_shape_cache.find(cp);
		if (it != m_shape_cache.end()) return it->second;
		Shape2D shape;
		if (m_font) {
			shape.commands = std::move(m_font->get_char_path(cp).commands);
			shape.line_width = m_line_width;
			shape.line_cap = m_line_cap;
			shape.line_join = m_line_join;
			shape.miter_limit = m_miter_limit;
			shape.compile(100);
		}
		return m_shape_cache.emplace(cp, std::move(shape)).first->second;
	}

	CharMetrics get_char_metrics(int cp) const {
		CharMetrics m = {0, 0, 0, 0};
		if (m_font) {
			auto fm = m_font->get_char_metrics(cp);
			m.advance = fm.advance; m.width = fm.x1 - fm.x0; m.ascent = fm.y1; m.descent = fm.y0;
		}
		return m;
	}

	StringMetrics get_string_metrics(const char* text) const {
		StringMetrics m = {0, 0, 0, 0};
		if (m_font) {
			auto sm = m_font->get_string_metrics(text);
			m.width = sm.width; m.ascent = sm.ascent; m.descent = sm.descent; m.line_gap = sm.line_gap;
		}
		return m;
	}

	void set_pixel_height(float pixels) {
		if (m_pixel_height != pixels) {
			m_pixel_height = pixels;
			if (m_font) { m_font->set_pixel_height(pixels); m_shape_cache.clear(); }
		}
	}
	float get_pixel_height() const { return m_pixel_height; }

	void draw_string(Canvas2D& canvas, const char* text, float x, float y, const Paint& fill_paint, const Paint& stroke_paint) const {
		if (!m_font || !text) return;
		for (const char* p = text; *p;) {
			unsigned c = (unsigned char)*p++;
			int cp = c;
			if (c >= 0x80) {
				int n = c < 0xE0 ? 1 : c < 0xF0 ? 2 : 3;
				cp = c & (0x3F >> n);
				while (n-- && *p) cp = cp << 6 | (*p++ & 0x3F);
			}
			canvas.draw_shape(get_char_shape(cp), fill_paint, stroke_paint, x, y, 1.0f, -1.0f);
			x += m_font->get_char_metrics(cp).advance;
		}
	}

private:
	Font* m_font;
	float m_line_width;
	Shape2D::LineCap m_line_cap;
	Shape2D::LineJoin m_line_join;
	float m_miter_limit;
	float m_pixel_height;
	mutable std::unordered_map<int, Shape2D> m_shape_cache;
};

#endif // FONT2D_HPP

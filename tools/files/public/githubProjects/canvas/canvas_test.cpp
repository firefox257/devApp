// ./canvas_test.cpp
// Test exporter for the pure C++ Canvas2D library (Strictly uses Shape2D/Font2D)
//
// File layout (single translation unit - the fragments below are #included,
// mirroring the #include "canvas2d.cpp" pattern; do NOT compile them standalone):
//   canvas_test.cpp             - shared state, prefetch, buffer inspection exports
//   canvas_test_demos.hpp       - Tests 1-15  (basic rendering demos, incl. §10 typography)
//   canvas_test_svg.hpp         - Tests 16-17 (SVG 2 masking & clipping + self-tests)
//   canvas_test_fillrule.hpp    - Test 18     (SVG 2 fill-rule + self-tests)
//   canvas_test_composite.hpp   - Test 19     (SVG 2 Porter-Duff compositing + self-tests)
//   canvas_test_markers.hpp     - Test 20     (SVG 2 markers + self-tests)
//   canvas_test_filters.hpp     - Test 21     (SVG 2 filters + self-tests)
//   canvas_test_typography.hpp  - Test 22     (SVG 2 §10 text & typography + self-tests)
//   canvas_test_globalalpha.hpp - Test 23     (globalAlpha state property + self-tests)
#include <autogen.hpp>
#include <fetch_ext.hpp>
#include <cstdio>
#include <limits>
#include <type_traits>
#include <utility>
#include "canvas2d.cpp"
#include "font2d.hpp"
ag_dedicated_thread_count(1);
ag_undedicated_thread_count(2);
// Test 16 needs the mask-enabled canvas2d.hpp (class Mask + Canvas2D::set_mask).
template <class T, class = void> struct has_set_mask : std::false_type {};
template <class T> struct has_set_mask<T, decltype(void(std::declval<T&>().set_mask(nullptr)))> : std::true_type {};
static_assert(has_set_mask<Canvas2D>::value,
	"Test 16 requires the mask-enabled canvas2d.hpp (class Mask + Canvas2D::set_mask/clear_mask).");
// Test 17 needs the clip-enabled canvas2d.hpp (class ClipPath + Canvas2D::set_clip).
template <class T, class = void> struct has_set_clip : std::false_type {};
template <class T> struct has_set_clip<T, decltype(void(std::declval<T&>().set_clip(nullptr)))> : std::true_type {};
static_assert(has_set_clip<Canvas2D>::value,
	"Test 17 requires the clip-enabled canvas2d.hpp (class ClipPath + Canvas2D::set_clip/clear_clip).");
// Test 18 needs the fill-rule-enabled library (FillRule + Canvas2D::fill_rule
// + Shape2D::set_fill_rule).
template <class T, class = void> struct has_fill_rule : std::false_type {};
template <class T> struct has_fill_rule<T, decltype(void(std::declval<T&>().fill_rule(FillRule::NonZero)))> : std::true_type {};
static_assert(has_fill_rule<Canvas2D>::value,
	"Test 18 requires the fill-rule-enabled canvas2d.hpp (enum FillRule + Canvas2D::fill_rule).");
template <class T, class = void> struct has_set_fill_rule : std::false_type {};
template <class T> struct has_set_fill_rule<T, decltype(void(std::declval<T&>().set_fill_rule(FillRule::NonZero)))> : std::true_type {};
static_assert(has_set_fill_rule<Shape2D>::value,
	"Test 18 requires the fill-rule-enabled shape2d.hpp (Shape2D::set_fill_rule/clear_fill_rule).");
// Test 19 needs the Porter-Duff-enabled library (CompositeOp +
// Canvas2D::composite_op / global_composite_operation).
template <class T, class = void> struct has_composite_op : std::false_type {};
template <class T> struct has_composite_op<T, decltype(void(std::declval<T&>().composite_op(CompositeOp::SourceOver)))> : std::true_type {};
static_assert(has_composite_op<Canvas2D>::value,
	"Test 19 requires the composite-enabled canvas2d.hpp (enum CompositeOp + Canvas2D::composite_op).");
// Test 20 needs the marker-enabled library (Marker + Canvas2D::set_markers).
template <class T, class = void> struct has_set_markers : std::false_type {};
template <class T> struct has_set_markers<T, decltype(void(std::declval<T&>().set_markers(nullptr, nullptr, nullptr)))> : std::true_type {};
static_assert(has_set_markers<Canvas2D>::value,
	"Test 20 requires the marker-enabled canvas2d.hpp (class Marker + Canvas2D::set_markers).");
// Test 21 needs the filter-enabled library (Filter + Canvas2D::set_filter /
// apply_filter + Filter::apply off-screen buffer API).
template <class T, class = void> struct has_set_filter : std::false_type {};
template <class T> struct has_set_filter<T, decltype(void(std::declval<T&>().set_filter(nullptr)))> : std::true_type {};
static_assert(has_set_filter<Canvas2D>::value,
	"Test 21 requires the filter-enabled canvas2d.hpp (class Filter + Canvas2D::set_filter/clear_filter).");
template <class T, class = void> struct has_filter_apply : std::false_type {};
template <class T> struct has_filter_apply<T, decltype(void(std::declval<const T&>().apply(nullptr, 0, 0)))> : std::true_type {};
static_assert(has_filter_apply<Filter>::value,
	"Test 21 requires the off-screen filter API (Filter::apply(uint32_t*, int, int)).");
// Test 22 needs the SVG 2 §10 typography API (TextStyle + text_anchor /
// dominant_baseline / letter_spacing / font_weight / text_length).
template <class T, class = void> struct has_text_anchor : std::false_type {};
template <class T> struct has_text_anchor<T, decltype(void(std::declval<T&>().text_anchor(TextAnchor::Start)))> : std::true_type {};
static_assert(has_text_anchor<Canvas2D>::value,
	"Test 22 requires the typography-enabled canvas2d.hpp (enum TextAnchor + Canvas2D::text_anchor).");
template <class T, class = void> struct has_text_style : std::false_type {};
template <class T> struct has_text_style<T, decltype(void(std::declval<T&>().text_style(TextStyle())))> : std::true_type {};
static_assert(has_text_style<Canvas2D>::value,
	"Test 22 requires the typography-enabled canvas2d.hpp (struct TextStyle + Canvas2D::text_style).");
template <class T, class = void> struct has_font_weight_class : std::false_type {};
template <class T> struct has_font_weight_class<T, decltype(void(std::declval<const T&>().weight_class()))> : std::true_type {};
static_assert(has_font_weight_class<Font>::value,
	"Test 22 requires the OS/2-aware font.hpp (Font::weight_class/is_italic/get_vmetrics).");
// Test 23 needs the globalAlpha state API (Canvas2D::global_alpha setter/getter).
template <class T, class = void> struct has_global_alpha : std::false_type {};
template <class T> struct has_global_alpha<T, decltype(void(std::declval<T&>().global_alpha(1.0f)))> : std::true_type {};
static_assert(has_global_alpha<Canvas2D>::value,
	"Test 23 requires the globalAlpha-enabled canvas2d.hpp (Canvas2D::global_alpha).");
// ============================================================================
// SHARED STATE (used by the fragments and the inspection exports below)
// ============================================================================
static Canvas2D* g_house_canvas = nullptr;
static Canvas2D* g_lines_canvas = nullptr;
static Canvas2D* g_path_canvas = nullptr;
static Canvas2D* g_alpha_canvas = nullptr;
static Canvas2D* g_hole_canvas = nullptr;
static Canvas2D* g_crossing_canvas = nullptr;
static Canvas2D* g_image_canvas = nullptr;
static Canvas2D* g_font_canvas = nullptr;
static Canvas2D* g_capjoin_canvas = nullptr;
static Canvas2D* g_gradient_canvas = nullptr;
static Canvas2D* g_text_shadow_canvas = nullptr;
static Canvas2D* g_transform_canvas = nullptr;
static Canvas2D* g_blend_canvas = nullptr;
static Canvas2D* g_pattern_canvas = nullptr;
static Canvas2D* g_dash_canvas = nullptr;
static Canvas2D* g_mask_canvas = nullptr;
static Canvas2D* g_clip_canvas = nullptr;
static Canvas2D* g_fillrule_canvas = nullptr;
static Canvas2D* g_composite_canvas = nullptr;
static Canvas2D* g_markers_canvas = nullptr;
static Canvas2D* g_filters_canvas = nullptr;
static Canvas2D* g_typography_canvas = nullptr;
static Canvas2D* g_globalalpha_canvas = nullptr;
static Font*     g_font = nullptr;
static unsigned char* g_prefetched_image_data = nullptr;
static size_t g_prefetched_image_size = 0;
static unsigned char* g_prefetched_font_data = nullptr;
static size_t g_prefetched_font_size = 0;
// ============================================================================
// PREFETCH (shared by the image/font/pattern/transform/mask/clip demos)
// ============================================================================
ag_export(prefetch_image)
ag_future* prefetch_image(const char* url) {
	ag_future* fut = fetch(url);
	uint32_t structPtr = ag_await(uint32_t, fut);
	if (structPtr == 0) ag_return 0;
	FetchResult* res = (FetchResult*)(uintptr_t)structPtr;
	int ok = 0;
	if (res->status_code == 200 && res->data_ptr != 0 && res->size > 0) {
		if (g_prefetched_image_data) free(g_prefetched_image_data);
		g_prefetched_image_size = res->size;
		g_prefetched_image_data = (unsigned char*)malloc(g_prefetched_image_size);
		if (g_prefetched_image_data) {
			memcpy(g_prefetched_image_data, (const void*)(uintptr_t)res->data_ptr, g_prefetched_image_size);
			ok = 1;
		}
	}
	if (res->data_ptr != 0) free((void*)(uintptr_t)res->data_ptr);
	free((void*)(uintptr_t)structPtr);
	ag_return ok;
}
ag_export(prefetch_font)
ag_future* prefetch_font(const char* url) {
	ag_future* fut = fetch(url);
	uint32_t structPtr = ag_await(uint32_t, fut);
	if (structPtr == 0) ag_return 0;
	FetchResult* res = (FetchResult*)(uintptr_t)structPtr;
	int ok = 0;
	if (res->status_code == 200 && res->data_ptr != 0 && res->size > 0) {
		if (g_prefetched_font_data) free(g_prefetched_font_data);
		g_prefetched_font_size = res->size;
		g_prefetched_font_data = (unsigned char*)malloc(g_prefetched_font_size);
		if (g_prefetched_font_data) {
			memcpy(g_prefetched_font_data, (const void*)(uintptr_t)res->data_ptr, g_prefetched_font_size);
			ok = 1;
		}
	}
	if (res->data_ptr != 0) free((void*)(uintptr_t)res->data_ptr);
	free((void*)(uintptr_t)structPtr);
	ag_return ok;
}
// ============================================================================
// TEST FRAGMENTS (order matters: demos, SVG, fill-rule, composite, markers,
// filters, typography, globalAlpha last)
// ============================================================================
#include "canvas_test_demos.hpp"
#include "canvas_test_svg.hpp"
#include "canvas_test_fillrule.hpp"
#include "canvas_test_composite.hpp"
#include "canvas_test_markers.hpp"
#include "canvas_test_filters.hpp"
#include "canvas_test_typography.hpp"
#include "canvas_test_globalalpha.hpp"
// ============================================================================
// EXPORTED INSPECTION FUNCTIONS
// ============================================================================
ag_export(get_house_buffer_ptr) uint32_t get_house_buffer_ptr() { return g_house_canvas ? (uint32_t)(uintptr_t)g_house_canvas->get_buffer() : 0; }
ag_export(get_house_width) uint32_t get_house_width() { return g_house_canvas ? g_house_canvas->get_width() : 0; }
ag_export(get_house_height) uint32_t get_house_height() { return g_house_canvas ? g_house_canvas->get_height() : 0; }
ag_export(get_lines_buffer_ptr) uint32_t get_lines_buffer_ptr() { return g_lines_canvas ? (uint32_t)(uintptr_t)g_lines_canvas->get_buffer() : 0; }
ag_export(get_lines_width) uint32_t get_lines_width() { return g_lines_canvas ? g_lines_canvas->get_width() : 0; }
ag_export(get_lines_height) uint32_t get_lines_height() { return g_lines_canvas ? g_lines_canvas->get_height() : 0; }
ag_export(get_path_buffer_ptr) uint32_t get_path_buffer_ptr() { return g_path_canvas ? (uint32_t)(uintptr_t)g_path_canvas->get_buffer() : 0; }
ag_export(get_path_width) uint32_t get_path_width() { return g_path_canvas ? g_path_canvas->get_width() : 0; }
ag_export(get_path_height) uint32_t get_path_height() { return g_path_canvas ? g_path_canvas->get_height() : 0; }
ag_export(get_alpha_buffer_ptr) uint32_t get_alpha_buffer_ptr() { return g_alpha_canvas ? (uint32_t)(uintptr_t)g_alpha_canvas->get_buffer() : 0; }
ag_export(get_alpha_width) uint32_t get_alpha_width() { return g_alpha_canvas ? g_alpha_canvas->get_width() : 0; }
ag_export(get_alpha_height) uint32_t get_alpha_height() { return g_alpha_canvas ? g_alpha_canvas->get_height() : 0; }
ag_export(get_hole_buffer_ptr) uint32_t get_hole_buffer_ptr() { return g_hole_canvas ? (uint32_t)(uintptr_t)g_hole_canvas->get_buffer() : 0; }
ag_export(get_hole_width) uint32_t get_hole_width() { return g_hole_canvas ? g_hole_canvas->get_width() : 0; }
ag_export(get_hole_height) uint32_t get_hole_height() { return g_hole_canvas ? g_hole_canvas->get_height() : 0; }
ag_export(get_crossing_buffer_ptr) uint32_t get_crossing_buffer_ptr() { return g_crossing_canvas ? (uint32_t)(uintptr_t)g_crossing_canvas->get_buffer() : 0; }
ag_export(get_crossing_width) uint32_t get_crossing_width() { return g_crossing_canvas ? g_crossing_canvas->get_width() : 0; }
ag_export(get_crossing_height) uint32_t get_crossing_height() { return g_crossing_canvas ? g_crossing_canvas->get_height() : 0; }
ag_export(get_image_buffer_ptr) uint32_t get_image_buffer_ptr() { return g_image_canvas ? (uint32_t)(uintptr_t)g_image_canvas->get_buffer() : 0; }
ag_export(get_image_width) uint32_t get_image_width() { return g_image_canvas ? g_image_canvas->get_width() : 0; }
ag_export(get_image_height) uint32_t get_image_height() { return g_image_canvas ? g_image_canvas->get_height() : 0; }
ag_export(get_font_buffer_ptr) uint32_t get_font_buffer_ptr() { return g_font_canvas ? (uint32_t)(uintptr_t)g_font_canvas->get_buffer() : 0; }
ag_export(get_font_width) uint32_t get_font_width() { return g_font_canvas ? g_font_canvas->get_width() : 0; }
ag_export(get_font_height) uint32_t get_font_height() { return g_font_canvas ? g_font_canvas->get_height() : 0; }
ag_export(get_capjoin_buffer_ptr) uint32_t get_capjoin_buffer_ptr() { return g_capjoin_canvas ? (uint32_t)(uintptr_t)g_capjoin_canvas->get_buffer() : 0; }
ag_export(get_capjoin_width) uint32_t get_capjoin_width() { return g_capjoin_canvas ? g_capjoin_canvas->get_width() : 0; }
ag_export(get_capjoin_height) uint32_t get_capjoin_height() { return g_capjoin_canvas ? g_capjoin_canvas->get_height() : 0; }
ag_export(get_gradient_buffer_ptr) uint32_t get_gradient_buffer_ptr() { return g_gradient_canvas ? (uint32_t)(uintptr_t)g_gradient_canvas->get_buffer() : 0; }
ag_export(get_gradient_width) uint32_t get_gradient_width() { return g_gradient_canvas ? g_gradient_canvas->get_width() : 0; }
ag_export(get_gradient_height) uint32_t get_gradient_height() { return g_gradient_canvas ? g_gradient_canvas->get_height() : 0; }
ag_export(get_text_shadow_buffer_ptr) uint32_t get_text_shadow_buffer_ptr() { return g_text_shadow_canvas ? (uint32_t)(uintptr_t)g_text_shadow_canvas->get_buffer() : 0; }
ag_export(get_text_shadow_width) uint32_t get_text_shadow_width() { return g_text_shadow_canvas ? g_text_shadow_canvas->get_width() : 0; }
ag_export(get_text_shadow_height) uint32_t get_text_shadow_height() { return g_text_shadow_canvas ? g_text_shadow_canvas->get_height() : 0; }
ag_export(get_transform_buffer_ptr) uint32_t get_transform_buffer_ptr() { return g_transform_canvas ? (uint32_t)(uintptr_t)g_transform_canvas->get_buffer() : 0; }
ag_export(get_transform_width) uint32_t get_transform_width() { return g_transform_canvas ? g_transform_canvas->get_width() : 0; }
ag_export(get_transform_height) uint32_t get_transform_height() { return g_transform_canvas ? g_transform_canvas->get_height() : 0; }
ag_export(get_blend_buffer_ptr) uint32_t get_blend_buffer_ptr() { return g_blend_canvas ? (uint32_t)(uintptr_t)g_blend_canvas->get_buffer() : 0; }
ag_export(get_blend_width) uint32_t get_blend_width() { return g_blend_canvas ? g_blend_canvas->get_width() : 0; }
ag_export(get_blend_height) uint32_t get_blend_height() { return g_blend_canvas ? g_blend_canvas->get_height() : 0; }
ag_export(get_pattern_buffer_ptr) uint32_t get_pattern_buffer_ptr() { return g_pattern_canvas ? (uint32_t)(uintptr_t)g_pattern_canvas->get_buffer() : 0; }
ag_export(get_pattern_width) uint32_t get_pattern_width() { return g_pattern_canvas ? g_pattern_canvas->get_width() : 0; }
ag_export(get_pattern_height) uint32_t get_pattern_height() { return g_pattern_canvas ? g_pattern_canvas->get_height() : 0; }
ag_export(get_dash_buffer_ptr) uint32_t get_dash_buffer_ptr() { return g_dash_canvas ? (uint32_t)(uintptr_t)g_dash_canvas->get_buffer() : 0; }
ag_export(get_dash_width) uint32_t get_dash_width() { return g_dash_canvas ? g_dash_canvas->get_width() : 0; }
ag_export(get_dash_height) uint32_t get_dash_height() { return g_dash_canvas ? g_dash_canvas->get_height() : 0; }
ag_export(get_mask_buffer_ptr) uint32_t get_mask_buffer_ptr() { return g_mask_canvas ? (uint32_t)(uintptr_t)g_mask_canvas->get_buffer() : 0; }
ag_export(get_mask_width) uint32_t get_mask_width() { return g_mask_canvas ? g_mask_canvas->get_width() : 0; }
ag_export(get_mask_height) uint32_t get_mask_height() { return g_mask_canvas ? g_mask_canvas->get_height() : 0; }
ag_export(get_clip_buffer_ptr) uint32_t get_clip_buffer_ptr() { return g_clip_canvas ? (uint32_t)(uintptr_t)g_clip_canvas->get_buffer() : 0; }
ag_export(get_clip_width) uint32_t get_clip_width() { return g_clip_canvas ? g_clip_canvas->get_width() : 0; }
ag_export(get_clip_height) uint32_t get_clip_height() { return g_clip_canvas ? g_clip_canvas->get_height() : 0; }
ag_export(get_fillrule_buffer_ptr) uint32_t get_fillrule_buffer_ptr() { return g_fillrule_canvas ? (uint32_t)(uintptr_t)g_fillrule_canvas->get_buffer() : 0; }
ag_export(get_fillrule_width) uint32_t get_fillrule_width() { return g_fillrule_canvas ? g_fillrule_canvas->get_width() : 0; }
ag_export(get_fillrule_height) uint32_t get_fillrule_height() { return g_fillrule_canvas ? g_fillrule_canvas->get_height() : 0; }
ag_export(get_composite_buffer_ptr) uint32_t get_composite_buffer_ptr() { return g_composite_canvas ? (uint32_t)(uintptr_t)g_composite_canvas->get_buffer() : 0; }
ag_export(get_composite_width) uint32_t get_composite_width() { return g_composite_canvas ? g_composite_canvas->get_width() : 0; }
ag_export(get_composite_height) uint32_t get_composite_height() { return g_composite_canvas ? g_composite_canvas->get_height() : 0; }
ag_export(get_markers_buffer_ptr) uint32_t get_markers_buffer_ptr() { return g_markers_canvas ? (uint32_t)(uintptr_t)g_markers_canvas->get_buffer() : 0; }
ag_export(get_markers_width) uint32_t get_markers_width() { return g_markers_canvas ? g_markers_canvas->get_width() : 0; }
ag_export(get_markers_height) uint32_t get_markers_height() { return g_markers_canvas ? g_markers_canvas->get_height() : 0; }
ag_export(get_filters_buffer_ptr) uint32_t get_filters_buffer_ptr() { return g_filters_canvas ? (uint32_t)(uintptr_t)g_filters_canvas->get_buffer() : 0; }
ag_export(get_filters_width) uint32_t get_filters_width() { return g_filters_canvas ? g_filters_canvas->get_width() : 0; }
ag_export(get_filters_height) uint32_t get_filters_height() { return g_filters_canvas ? g_filters_canvas->get_height() : 0; }
ag_export(get_typography_buffer_ptr) uint32_t get_typography_buffer_ptr() { return g_typography_canvas ? (uint32_t)(uintptr_t)g_typography_canvas->get_buffer() : 0; }
ag_export(get_typography_width) uint32_t get_typography_width() { return g_typography_canvas ? g_typography_canvas->get_width() : 0; }
ag_export(get_typography_height) uint32_t get_typography_height() { return g_typography_canvas ? g_typography_canvas->get_height() : 0; }
ag_export(get_globalalpha_buffer_ptr) uint32_t get_globalalpha_buffer_ptr() { return g_globalalpha_canvas ? (uint32_t)(uintptr_t)g_globalalpha_canvas->get_buffer() : 0; }
ag_export(get_globalalpha_width) uint32_t get_globalalpha_width() { return g_globalalpha_canvas ? g_globalalpha_canvas->get_width() : 0; }
ag_export(get_globalalpha_height) uint32_t get_globalalpha_height() { return g_globalalpha_canvas ? g_globalalpha_canvas->get_height() : 0; }
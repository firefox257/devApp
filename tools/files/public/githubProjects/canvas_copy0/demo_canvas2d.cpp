// ./demo_canvas2d.cpp
// Fantasy HUD icons + live minimap — rebuilt for the Shape2D-based Canvas2D.
// Every icon renders into its OWN 128x128 Canvas2D with a transparent background.
//
// Per-frame protocol (unchanged exports, same state header):
//   1. JS writes the world snapshot into the float array at get_state_ptr()
//      and sets state[H_MAGIC] = 1
//   2. JS calls render_all(time_ms, 0)
//   3. JS copies each icon buffer (get_icon_ptr(id)) into a texture / ImageData
//
// Engine features showcased:
//   * Shape2D path API (line width / caps / joins / dashes live on the shape)
//   * ClipPath  : heart liquid level, potion waves, mana glass, minimap disc
//   * Mask      : luminance fade on the wisp's hem
//   * Pattern   : parchment fibre texture, minimap grid
//   * Dashes    : portal rune ring, lock progress, radar range rings, route
//   * Marker    : route chevrons (mid) + arrowhead (end), context-stroke paint
//   * BlendMode : Screen for glows, embers, sparks, radar sweep
//   * globalAlpha: portal dimming, wisp motion trail
//   * Filter    : gaussian bloom pass at quality 2 (Ultra)
//
// Quality tiers (state[H_QUALITY]): 0 = fast, 1 = full, 2 = ultra (bloom).
#include <autogen.hpp>
#include "canvas2d.cpp"
#include <cmath>

ag_dedicated_thread_count(1);
ag_undedicated_thread_count(1);

namespace {

constexpr int   ICON_PX = 128;
constexpr float PI  = 3.14159265358979323846f;
constexpr float TAU = 6.28318530717958647692f;

enum IconId {
    ICON_PORTAL = 0, ICON_HEART, ICON_GEAR, ICON_LOCK, ICON_SCROLL,
    ICON_FIRE,   ICON_MANA,  ICON_CHECK, ICON_WISP, ICON_SHIELD,
    ICON_POTION, ICON_COIN,  ICON_SKULL, ICON_MAP,  ICON_COUNT
};

// ---- snapshot header written by JS (indices into g_state) ----
enum {
    H_HEALTH = 0, H_MANA, H_UNLOCK, H_COMPLETE, H_SHIELD, H_COINS, H_COMBO,
    H_PX, H_PZ, H_YAW, H_EXTENT, H_ECOUNT, H_QUALITY, H_R13, H_R14, H_MAGIC,
    HDR = 16
};

// ---- entity kinds: (x, z, kind) triples right after the header ----
enum {
    K_GEAR = 0, K_HEART, K_WISP, K_BRUTE, K_NPC, K_PORTAL, K_TREE,
    K_POTION, K_COIN, K_SHIELD, K_GATE, K_FIRE
};

constexpr int MAX_ENT      = 192;
constexpr int STATE_FLOATS = HDR + MAX_ENT * 3;
float g_state[STATE_FLOATS];

struct Snap {
    float health = 100.0f, mana = 100.0f, unlock = 0.0f, complete = 0.0f;
    float shield = 0.0f, coins = 0.0f, combo = 0.0f;
    float px = 0.0f, pz = 0.0f, yaw = 0.0f, extent = 26.0f;
    int   count = 0;
    int   quality = 1;              // 0 fast, 1 full, 2 ultra
    const float* ent = nullptr;
};

Canvas2D* g_icons[ICON_COUNT] = {};
bool      g_art_ready = false;

// ======================================================================
// small math / colour helpers
// ======================================================================
inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
inline float clamp01(float v) { return clampf(v, 0.0f, 1.0f); }
inline float lerp(float a, float b, float t) { return a + (b - a) * t; }
inline float pulse(float t, float f) { return 0.5f + 0.5f * std::sin(t * f); }
inline uint8_t q8(float v) {
    int i = static_cast<int>(clamp01(v) * 255.0f + 0.5f);
    return static_cast<uint8_t>(i > 255 ? 255 : i);
}
inline uint8_t mix8(uint8_t a, uint8_t b, float t) {
    return static_cast<uint8_t>(a + (b - a) * clamp01(t));
}
const uint32_t NONE = rgba(0, 0, 0, 0);

// ======================================================================
// gradient bank (all icons share the same 0..128 coordinate space)
// ======================================================================
LinearGradient*  g_gold = nullptr, *g_steel = nullptr, *g_parch = nullptr,
               * g_wood = nullptr, *g_mana = nullptr, *g_lowmana = nullptr,
               * g_poison = nullptr, *g_flame = nullptr, *g_bone = nullptr,
               * g_shieldg = nullptr, *g_glass = nullptr, *g_heartDark = nullptr,
               * g_fadeGrad = nullptr;
RadialGradient*  g_heart = nullptr, *g_ghost = nullptr, *g_orb = nullptr,
               * g_mapbg = nullptr, *g_coin = nullptr, *g_mapFog = nullptr;
ConicalGradient* g_swirl = nullptr, *g_radar = nullptr;

constexpr int POOL_N = 6;
RadialGradient* g_rpool[POOL_N] = {};
LinearGradient* g_lpool[POOL_N] = {};
int g_rslot = 0, g_lslot = 0;

// patterns / mask / markers / bloom
Pattern*  g_parchTex = nullptr;
Pattern*  g_gridPat  = nullptr;
Shape2D   g_texDark, g_texLight, g_texFiber, g_gridLines;
Mask      g_wispFade;
Shape2D   g_fadeRect;
Marker    g_routeArrow, g_routeChev;
Shape2D   g_arrowHead, g_chevron;
Canvas2D* g_bloom = nullptr;
Filter    g_bloomFilter;

LinearGradient* lg(float x0, float y0, float x1, float y1,
                   float o0, uint32_t c0, float o1, uint32_t c1,
                   float o2 = -1.0f, uint32_t c2 = 0,
                   float o3 = -1.0f, uint32_t c3 = 0) {
    LinearGradient* g = new LinearGradient(x0, y0, x1, y1);
    g->add_stop(o0, c0).add_stop(o1, c1);
    if (o2 >= 0.0f) g->add_stop(o2, c2);
    if (o3 >= 0.0f) g->add_stop(o3, c3);
    g->prepare();
    return g;
}
RadialGradient* rg(float cx, float cy, float r,
                   float o0, uint32_t c0, float o1, uint32_t c1,
                   float o2 = -1.0f, uint32_t c2 = 0) {
    RadialGradient* g = new RadialGradient(cx, cy, r, cx, cy);
    g->add_stop(o0, c0).add_stop(o1, c1);
    if (o2 >= 0.0f) g->add_stop(o2, c2);
    g->prepare();
    return g;
}

// Pooled soft radial bloom. Icons rasterise immediately, so re-arming a slot
// on a later call is always safe.
Gradient* glow_grad(float cx, float cy, float r, uint8_t R, uint8_t G, uint8_t B, uint8_t a0) {
    RadialGradient* g = g_rpool[g_rslot];
    g_rslot = (g_rslot + 1) % POOL_N;
    g->cx = cx; g->cy = cy; g->r = r; g->fx = cx; g->fy = cy;
    g->stops.clear();
    g->add_stop(0.00f, rgba(R, G, B, a0));
    g->add_stop(0.35f, rgba(R, G, B, static_cast<uint8_t>(a0 * 0.55f)));
    g->add_stop(0.70f, rgba(R, G, B, static_cast<uint8_t>(a0 * 0.18f)));
    g->add_stop(1.00f, rgba(R, G, B, 0));
    g->invalidate(); g->prepare();
    return g;
}
Gradient* sheen_grad(float x0, float y0, float x1, float y1, uint8_t a) {
    LinearGradient* g = g_lpool[g_lslot];
    g_lslot = (g_lslot + 1) % POOL_N;
    g->x1 = x0; g->y1 = y0; g->x2 = x1; g->y2 = y1;
    g->stops.clear();
    g->add_stop(0.00f, rgba(255, 255, 255, 0));
    g->add_stop(0.50f, rgba(255, 255, 255, a));
    g->add_stop(1.00f, rgba(255, 255, 255, 0));
    g->invalidate(); g->prepare();
    return g;
}

// ======================================================================
// shape builders (Shape2D IS a Path2D — geometry + stroke style in one)
// ======================================================================
Shape2D circle(float cx, float cy, float r) {
    Shape2D s; s.at(cx, cy, r, 0.0f, TAU, false); return s;
}
Shape2D seg(float x0, float y0, float x1, float y1) {
    Shape2D s; s.mt(x0, y0).lt(x1, y1); return s;
}
Shape2D rrect(float x, float y, float w, float h, float r) {
    r = clampf(r, 0.0f, std::min(w, h) * 0.5f);
    Shape2D p;
    p.mt(x + r, y).lt(x + w - r, y);
    if (r > 0.0f) p.qt(x + w, y, x + w, y + r);
    p.lt(x + w, y + h - r);
    if (r > 0.0f) p.qt(x + w, y + h, x + w - r, y + h);
    p.lt(x + r, y + h);
    if (r > 0.0f) p.qt(x, y + h, x, y + h - r);
    p.lt(x, y + r);
    if (r > 0.0f) p.qt(x, y, x + r, y);
    p.close();
    return p;
}
Shape2D ellipse(float cx, float cy, float rx, float ry) {
    const float k = 0.5522847498f;
    float ox = rx * k, oy = ry * k;
    Shape2D p;
    p.mt(cx, cy - ry)
     .ct(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy)
     .ct(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry)
     .ct(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy)
     .ct(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry)
     .close();
    return p;
}
Shape2D star(float cx, float cy, float ro, float ri, int n, float rot) {
    Shape2D p;
    int total = n * 2;
    for (int i = 0; i < total; ++i) {
        float a = rot + static_cast<float>(i) * TAU / static_cast<float>(total);
        float r = (i & 1) ? ri : ro;
        float x = cx + std::cos(a) * r, y = cy + std::sin(a) * r;
        if (i == 0) p.mt(x, y); else p.lt(x, y);
    }
    p.close();
    return p;
}
// Animated liquid surface: open sine polyline / closed body down to `bottom`.
Shape2D waveLine(float x0, float x1, float y, float amp, float ph, float k) {
    Shape2D s; const int N = 14;
    s.mt(x0, y + amp * std::sin(ph));
    for (int i = 1; i <= N; ++i) {
        float u = static_cast<float>(i) / N;
        s.lt(x0 + (x1 - x0) * u, y + amp * std::sin(ph + u * k));
    }
    return s;
}
Shape2D waveRect(float x0, float x1, float top, float bottom, float amp, float ph, float k) {
    Shape2D s = waveLine(x0, x1, top, amp, ph, k);
    s.lt(x1, bottom).lt(x0, bottom).close();
    return s;
}

// ======================================================================
// paint helpers — stroke style lives on the Shape2D now
// ======================================================================
inline void fillShape(Canvas2D& c, Shape2D s, uint32_t col) {
    if (s.commands.empty()) return;
    c.fill_style(col).stroke_style(NONE).path(s);
}
inline void fillShape(Canvas2D& c, Shape2D s, Gradient* g) {
    if (!g || s.commands.empty()) return;
    c.fill_style(g).stroke_style(NONE).path(s);
}
inline void fillShape(Canvas2D& c, Shape2D s, Pattern* p) {
    if (!p || s.commands.empty()) return;
    c.fill_style(p).stroke_style(NONE).path(s);
}
inline void paint(Canvas2D& c, Shape2D s, uint32_t f, uint32_t st, float sw) {
    if (s.commands.empty()) return;
    s.line_width = sw; s.line_cap = Shape2D::CAP_ROUND; s.line_join = Shape2D::JOIN_ROUND;
    c.fill_style(f).stroke_style(st).path(s);
}
inline void paint(Canvas2D& c, Shape2D s, Gradient* g, uint32_t st, float sw) {
    if (!g || s.commands.empty()) return;
    s.line_width = sw; s.line_cap = Shape2D::CAP_ROUND; s.line_join = Shape2D::JOIN_ROUND;
    c.fill_style(g).stroke_style(st).path(s);
}
inline void strokeShape(Canvas2D& c, Shape2D s, uint32_t col, float sw, int cap = Shape2D::CAP_ROUND) {
    if (s.commands.empty()) return;
    s.line_width = sw; s.line_cap = cap; s.line_join = Shape2D::JOIN_ROUND;
    c.fill_style(NONE).stroke_style(col).path(s);
}
inline void strokeShape(Canvas2D& c, Shape2D s, Gradient* g, float sw, int cap = Shape2D::CAP_ROUND) {
    if (!g || s.commands.empty()) return;
    s.line_width = sw; s.line_cap = cap; s.line_join = Shape2D::JOIN_ROUND;
    c.fill_style(NONE).stroke_style(g).path(s);
}
void disc(Canvas2D& c, float x, float y, float r, uint32_t col) {
    if (r > 0.0f) fillShape(c, circle(x, y, r), col);
}
void disc(Canvas2D& c, float x, float y, float r, Gradient* g) {
    if (r > 0.0f) fillShape(c, circle(x, y, r), g);
}
void ring(Canvas2D& c, float x, float y, float r, float w, uint32_t col) {
    if (r > 0.0f && w > 0.0f) strokeShape(c, circle(x, y, r), col, w, Shape2D::CAP_BUTT);
}
void ring(Canvas2D& c, float x, float y, float r, float w, Gradient* g) {
    if (r > 0.0f && w > 0.0f) strokeShape(c, circle(x, y, r), g, w, Shape2D::CAP_BUTT);
}
void arcSeg(Canvas2D& c, float x, float y, float r, float a0, float a1, float w, uint32_t col) {
    if (r <= 0.0f || w <= 0.0f) return;
    Shape2D s; s.at(x, y, r, a0, a1, false);
    strokeShape(c, std::move(s), col, w);
}
void glow(Canvas2D& c, float x, float y, float r, uint8_t R, uint8_t G, uint8_t B, uint8_t a) {
    if (r <= 0.0f || a == 0) return;
    disc(c, x, y, r, glow_grad(x, y, r, R, G, B, a));
}
// SVG stroke-dasharray on a ring, with an animated dashoffset.
void dashedRing(Canvas2D& c, float x, float y, float r, float w, uint32_t col,
                float on, float off, float phase) {
    if (r <= 0.0f || w <= 0.0f) return;
    Shape2D s = circle(x, y, r);
    s.line_width = w; s.line_cap = Shape2D::CAP_BUTT;
    s.set_dash_array({on, off});
    s.dash_offset = phase;
    c.fill_style(NONE).stroke_style(col).path(s);
}

// Ultra-quality bloom: bright discs -> 64px offscreen -> gaussian -> Screen.
struct BloomDisc { float x, y, r; uint32_t col; };
void bloom(Canvas2D& c, const BloomDisc* d, int n) {
    if (!g_bloom || n <= 0) return;
    g_bloom->clear(0u);
    g_bloom->setTransform(0.5f, 0.0f, 0.0f, 0.5f, 0.0f, 0.0f);
    for (int i = 0; i < n; ++i) fillShape(*g_bloom, circle(d[i].x, d[i].y, d[i].r), d[i].col);
    g_bloom->apply_filter(g_bloomFilter);
    c.save();
    c.blend_mode(BlendMode::Screen).global_alpha(0.65f);
    c.draw_pixels(g_bloom->get_buffer(), 64, 64, 0.0f, 0.0f,
                  static_cast<float>(ICON_PX), static_cast<float>(ICON_PX));
    c.restore();
}

// ======================================================================
// static art / engine objects
// ======================================================================
void build_art() {
    if (g_art_ready) return;
    g_art_ready = true;

    for (int i = 0; i < POOL_N; ++i) {
        g_rpool[i] = rg(0, 0, 1, 0.0f, rgba(255,255,255,255), 1.0f, rgba(255,255,255,0));
        g_lpool[i] = lg(0, 0, 1, 1, 0.0f, rgba(255,255,255,0), 1.0f, rgba(255,255,255,0));
    }

    g_gold    = lg(0, 16, 0, 116, 0.00f, rgba(255,248,205,255), 0.34f, rgba(240,199,88,255),
                   0.62f, rgba(186,138,38,255), 1.00f, rgba(112,78,22,255));
    g_steel   = lg(0, 16, 0, 116, 0.00f, rgba(244,246,252,255), 0.40f, rgba(178,184,201,255),
                   0.72f, rgba(116,122,140,255), 1.00f, rgba(72,76,92,255));
    g_parch   = lg(0, 18, 0, 114, 0.00f, rgba(255,246,220,255), 0.55f, rgba(238,216,170,255),
                   1.00f, rgba(198,166,116,255));
    g_wood    = lg(0, 0, 0, 128, 0.00f, rgba(196,138,84,255), 1.00f, rgba(104,66,36,255));
    g_mana    = lg(0, 28, 0, 118, 0.00f, rgba(160,238,255,255), 0.45f, rgba(64,146,255,255),
                   1.00f, rgba(26,62,190,255));
    g_lowmana = lg(0, 28, 0, 118, 0.00f, rgba(255,186,160,255), 0.50f, rgba(226,84,64,255),
                   1.00f, rgba(140,26,32,255));
    g_poison  = lg(0, 52, 0, 114, 0.00f, rgba(206,255,158,255), 0.45f, rgba(96,222,96,255),
                   1.00f, rgba(24,132,84,255));
    g_flame   = lg(0, 18, 0, 118, 0.00f, rgba(255,255,214,255), 0.28f, rgba(255,206,72,255),
                   0.66f, rgba(255,112,20,255), 1.00f, rgba(168,28,0,255));
    g_bone    = lg(0, 22, 0, 112, 0.00f, rgba(255,253,244,255), 0.52f, rgba(228,216,192,255),
                   1.00f, rgba(154,142,120,255));
    g_shieldg = lg(0, 18, 0, 114, 0.00f, rgba(206,232,255,255), 0.42f, rgba(96,158,238,255),
                   1.00f, rgba(30,64,146,255));
    g_glass   = lg(0, 30, 0, 110, 0.00f, rgba(226,244,255,150), 0.50f, rgba(170,206,236,90),
                   1.00f, rgba(120,160,200,120));
    g_heartDark = lg(0, 20, 0, 116, 0.00f, rgba(96,20,40,255), 1.00f, rgba(44,8,22,255));

    g_heart = rg(50, 44, 66, 0.00f, rgba(255,158,176,255), 0.42f, rgba(232,48,88,255),
                 1.00f, rgba(126,8,40,255));
    g_ghost = rg(64, 54, 58, 0.00f, rgba(244,230,255,255), 0.48f, rgba(176,124,255,235),
                 1.00f, rgba(84,36,176,170));
    g_orb   = rg(64, 64, 26, 0.00f, rgba(255,255,255,255), 0.38f, rgba(216,198,255,255),
                 1.00f, rgba(112,64,214,255));
    g_coin  = rg(52, 50, 62, 0.00f, rgba(255,250,214,255), 0.45f, rgba(240,196,72,255),
                 1.00f, rgba(150,102,18,255));
    g_mapbg = rg(64, 64, 66, 0.00f, rgba(30,40,66,255), 0.68f, rgba(15,20,36,255),
                 1.00f, rgba(7,9,18,255));
    g_mapFog = rg(64, 64, 57, 0.00f, rgba(5,8,16,0), 0.78f, rgba(5,8,16,0),
                  1.00f, rgba(5,8,16,150));

    g_swirl = new ConicalGradient(64, 64, 0.0f);
    g_swirl->add_stop(0.00f, rgba(120, 80, 255,   0));
    g_swirl->add_stop(0.18f, rgba(  0,236, 255, 235));
    g_swirl->add_stop(0.42f, rgba(190,110, 255, 190));
    g_swirl->add_stop(0.62f, rgba(255,255, 255, 245));
    g_swirl->add_stop(0.84f, rgba(150, 90, 255, 170));
    g_swirl->add_stop(1.00f, rgba(120, 80, 255,   0));
    g_swirl->prepare();

    // radar sweep: bright trailing wedge, hard leading edge at the wrap
    g_radar = new ConicalGradient(64, 64, 0.0f);
    g_radar->add_stop(0.00f, rgba(150,210,255,  0));
    g_radar->add_stop(0.75f, rgba(150,210,255,  0));
    g_radar->add_stop(0.98f, rgba(150,210,255, 80));
    g_radar->add_stop(1.00f, rgba(190,230,255,150));
    g_radar->prepare();

    // ---- parchment fibre pattern (26px tile, user space, repeating) ----
    const float darkDots[][3] = {{3,5,.8f},{14,9,.7f},{22,4,.9f},{8,18,.7f},{19,21,.8f},{24,15,.6f},{12,24,.7f}};
    for (auto& d : darkDots) { g_texDark.at(d[0], d[1], d[2], 0.0f, TAU, false); }
    const float liteDots[][3] = {{6,11,.6f},{17,3,.5f},{23,20,.6f},{10,15,.5f},{2,22,.6f}};
    for (auto& d : liteDots) { g_texLight.at(d[0], d[1], d[2], 0.0f, TAU, false); }
    g_texFiber.mt(1, 7).lt(9, 8).mt(13, 17).lt(24, 16).mt(4, 23).lt(15, 24);
    g_texFiber.line_width = 0.8f;
    g_parchTex = new Pattern(26.0f, 26.0f);
    g_parchTex->add(g_texDark,  Paint(rgba(110, 74, 36, 18)));
    g_parchTex->add(g_texLight, Paint(rgba(255,250,235, 12)));
    g_parchTex->add(g_texFiber, Paint(NONE), Paint(rgba(120, 84, 44, 12)));

    // ---- minimap grid pattern (12px tile) ----
    g_gridLines.mt(0.5f, 0.0f).lt(0.5f, 12.0f).mt(0.0f, 0.5f).lt(12.0f, 0.5f);
    g_gridLines.line_width = 1.0f;
    g_gridPat = new Pattern(12.0f, 12.0f);
    g_gridPat->add(g_gridLines, Paint(NONE), Paint(rgba(120,160,230,20)));

    // ---- wisp hem fade: luminance mask, white -> transparent ----
    g_fadeGrad = lg(0, 34, 0, 96, 0.0f, rgba(255,255,255,255), 1.0f, rgba(255,255,255,0));
    g_fadeRect.mt(24, 16).lt(100, 16).lt(100, 112).lt(24, 112).close();
    g_wispFade.set_units(Mask::Units::UserSpaceOnUse)
              .set_region(24.0f, 16.0f, 76.0f, 96.0f)
              .set_type(Mask::Type::Luminance)
              .add(g_fadeRect, Paint(g_fadeGrad));

    // ---- route markers (inherit the route's stroke paint) ----
    g_arrowHead.mt(0.0f, -3.4f).lt(7.5f, 0.0f).lt(0.0f, 3.4f).lt(2.0f, 0.0f).close();
    g_routeArrow.set_units(Marker::Units::UserSpaceOnUse)
                .set_orient_auto().set_ref(4.0f, 0.0f)
                .set_size(10.0f, 8.0f).set_overflow_visible(true)
                .add_context(g_arrowHead, Marker::Context::Stroke, Marker::Context::None);
    g_chevron.mt(-2.2f, -3.0f).lt(2.2f, 0.0f).lt(-2.2f, 3.0f);
    g_chevron.line_width = 1.6f; g_chevron.line_cap = Shape2D::CAP_ROUND;
    g_routeChev.set_units(Marker::Units::UserSpaceOnUse)
               .set_orient_auto().set_ref(0.0f, 0.0f)
               .set_size(6.0f, 6.0f).set_overflow_visible(true)
               .add_context(g_chevron, Marker::Context::None, Marker::Context::Stroke);

    // ---- bloom offscreen ----
    g_bloom = new Canvas2D(64, 64);
    g_bloomFilter.gaussian_blur(2.4f);
}

// ======================================================================
// icons
// ======================================================================
void icon_portal(Canvas2D& c, float t, const Snap& s) {
    float open = clamp01(s.unlock);
    float dim  = 0.35f + 0.65f * open;
    float spin = t * (1.4f + 3.0f * open);

    c.save();
    c.global_alpha(dim);                       // one knob dims the whole icon
    glow(c, 64, 64, 63, 126, 84, 255, 140);
    g_swirl->startAngle = spin;
    ring(c, 64, 64, 46, 11.0f, g_swirl);
    dashedRing(c, 64, 64, 53, 2.2f, rgba(196,150,255,200), 3.0f, 6.5f, -t * 26.0f);
    arcSeg(c, 64, 64, 34, -spin * 1.35f, -spin * 1.35f + PI * 1.15f, 5.0f, rgba(196,132,255,235));
    arcSeg(c, 64, 64, 24,  spin * 2.10f,  spin * 2.10f + PI * 0.80f, 3.0f, rgba(255,255,255,235));
    disc(c, 64, 64, 20.0f, rgba(16, 8, 34, 255));            // event horizon
    float pr = 12.0f + 2.5f * std::sin(t * 3.4f);
    disc(c, 64, 64, pr + 5.0f, glow_grad(64, 64, pr + 5.0f, 226, 208, 255, 220));
    disc(c, 64, 64, pr, g_orb);
    disc(c, 60, 60, 3.2f, rgba(255,255,255,200));            // specular
    if (s.quality > 0) {
        c.save(); c.blend_mode(BlendMode::Screen);
        for (int i = 0; i < 6; ++i) {
            float fi = static_cast<float>(i);
            float a  = spin * 0.8f + fi * (TAU / 6.0f);
            float rr = 55.0f + 2.0f * std::sin(t * 2.0f + fi);
            disc(c, 64 + std::cos(a) * rr, 64 + std::sin(a) * rr, 2.6f, rgba(255,255,255,215));
        }
        c.restore();
    }
    ring(c, 64, 64, 58.0f, 2.0f, rgba(150,110,255,140));
    c.restore();

    if (s.quality >= 2) {
        BloomDisc b[] = {{64, 64, pr + 6, rgba(150,110,255,160)}, {64, 64, 46, rgba(90,60,200,60)}};
        bloom(c, b, 2);
    }
}

void icon_heart(Canvas2D& c, float t, const Snap& s) {
    float hp   = clamp01(s.health / 100.0f);
    float rate = 3.6f + (1.0f - hp) * 7.0f;
    float beat = 1.0f + 0.055f * std::sin(t * rate) + 0.02f * std::sin(t * rate * 2.0f);
    float sc   = 0.205f * beat;
    auto hx = [&](float x) { return 64.0f + (x - 300.0f) * sc; };
    auto hy = [&](float y) { return 64.0f + (y - 300.0f) * sc; };

    glow(c, 64, 66, 60, 255, 58, 104, q8(0.30f + 0.50f * hp));

    Shape2D heart;
    heart.mt(hx(300), hy(150))
         .ct(hx(200), hy(46),  hx(96),  hy(150), hx(100), hy(252))
         .ct(hx(104), hy(404), hx(300), hy(506), hx(300), hy(506))
         .ct(hx(300), hy(506), hx(496), hy(404), hx(500), hy(252))
         .ct(hx(504), hy(150), hx(400), hy(46),  hx(300), hy(150))
         .close();

    c.drop_shadow(0.0f, 3.0f, 1.6f, rgba(70, 0, 16, 150));
    paint(c, heart, g_heartDark, rgba(120, 8, 40, 255), 3.0f);
    c.clear_shadow();

    // health as a liquid level, clipped to the heart outline
    ClipPath clip; clip.add(heart);
    c.set_clip(&clip);
    float top = hy(120), bot = hy(500);
    float lvl = bot + (top - bot) * hp;
    if (hp > 0.003f) {
        fillShape(c, waveRect(hx(80), hx(520), lvl, hy(520), 2.2f * beat, t * 3.0f, 9.0f), g_heart);
        c.save(); c.blend_mode(BlendMode::Screen);
        strokeShape(c, waveLine(hx(80), hx(520), lvl, 2.2f * beat, t * 3.0f, 9.0f),
                    rgba(255,200,215,120), 1.6f);
        c.restore();
        if (s.quality > 0) {
            for (int i = 0; i < 3; ++i) {
                float fi = static_cast<float>(i);
                float ph = std::fmod(t * 0.45f + fi * 0.37f, 1.0f);
                float by = lerp(hy(480), lvl + 5.0f, ph);
                if (by > lvl + 4.0f)
                    disc(c, hx(220 + i * 80) + std::sin(t * 2.0f + fi * 2.1f) * 3.0f, by,
                         1.6f + 1.2f * (1.0f - ph), rgba(255,210,220, q8(0.6f * (1.0f - ph))));
            }
        }
    }
    fillShape(c, ellipse(hx(208), hy(206), 8.0f * beat, 5.0f * beat), rgba(255,255,255,150));
    c.clear_clip();

    strokeShape(c, heart, rgba(255,190,205,70), 1.4f);
    if (s.quality >= 2) {
        BloomDisc b[] = {{64, 66, 34, rgba(255,60,100, static_cast<uint8_t>(60 + 80 * hp))}};
        bloom(c, b, 1);
    }
}

void icon_gear(Canvas2D& c, float t, const Snap& s) {
    const float cx = 64.0f, cy = 64.0f, k = 1.72f;
    float rot = t * 1.35f;
    glow(c, cx, cy, 62, 255, 212, 118, 78);

    // all 8 teeth in ONE shape -> one fill + one stroke pass
    Shape2D teeth;
    for (int i = 0; i < 8; ++i) {
        float a = rot + static_cast<float>(i) * (TAU / 8.0f);
        float dx = std::cos(a), dy = std::sin(a), nx = -dy, ny = dx;
        float bx = cx + dx * 17.0f * k, by = cy + dy * 17.0f * k;
        teeth.mt(bx + nx * 6.0f * k, by + ny * 6.0f * k)
             .lt(bx + dx * 13.0f * k + nx * 4.2f * k, by + dy * 13.0f * k + ny * 4.2f * k)
             .lt(bx + dx * 13.0f * k - nx * 4.2f * k, by + dy * 13.0f * k - ny * 4.2f * k)
             .lt(bx - nx * 6.0f * k, by - ny * 6.0f * k)
             .close();
    }
    paint(c, std::move(teeth), g_gold, rgba(120, 82, 20, 255), 1.6f);

    c.drop_shadow(0.0f, 2.0f, 1.4f, rgba(60, 40, 0, 140));
    disc(c, cx, cy, 20.0f * k, g_gold);
    c.clear_shadow();
    ring(c, cx, cy, 20.0f * k, 2.6f, rgba(255, 240, 186, 220));
    ring(c, cx, cy, 15.5f * k, 1.4f, rgba(120, 82, 20, 150));
    for (int i = 0; i < 4; ++i) {
        float a = -rot + static_cast<float>(i) * (TAU / 4.0f) + PI * 0.25f;
        disc(c, cx + std::cos(a) * 12.0f * k, cy + std::sin(a) * 12.0f * k, 3.6f * k, rgba(84, 58, 32, 255));
    }
    if (s.quality > 0) {
        float sa = rot * 1.6f;
        c.save(); c.blend_mode(BlendMode::Screen);
        arcSeg(c, cx, cy, 17.0f * k, sa - 0.85f, sa + 0.35f, 3.4f, rgba(255, 252, 220, 150));
        c.restore();
    }
    disc(c, cx, cy, 7.0f * k, rgba(46, 36, 74, 255));
    ring(c, cx, cy, 7.0f * k, 2.0f, rgba(255, 236, 170, 235));
}

void icon_lock(Canvas2D& c, float t, const Snap& s) {
    float prog = clamp01(s.unlock);
    const float cx = 64.0f, cy = 70.0f, k = 1.5f;
    float lift = prog * 11.0f * k;
    float rot  = -prog * 1.25f;
    float sw   = 24.0f * k, r = sw * 0.5f;
    float pvx  = cx - r, base_pvy = cy - 5.0f * k, pvy = base_pvy - lift;

    glow(c, cx, cy, 60, mix8(255, 110, prog), mix8(196, 255, prog), mix8(58, 150, prog), 74);

    auto rotPt = [&](float x, float y, float& ox, float& oy) {
        float dx = x - pvx, dy = y - pvy;
        ox = pvx + dx * std::cos(rot) - dy * std::sin(rot);
        oy = pvy + dx * std::sin(rot) + dy * std::cos(rot);
    };
    Shape2D shackle;
    shackle.mt(pvx, base_pvy + 16.0f * k).lt(pvx, pvy);
    for (int i = 0; i <= 28; ++i) {
        float a = PI + PI * static_cast<float>(i) / 28.0f;
        float rx, ry;
        rotPt(pvx + r + r * std::cos(a), pvy + r * std::sin(a), rx, ry);
        shackle.lt(rx, ry);
    }
    float ex, ey;
    rotPt(pvx + sw, pvy + 16.0f * k, ex, ey);
    shackle.lt(ex, ey);
    strokeShape(c, shackle, rgba(58, 54, 48, 255), 9.0f, Shape2D::CAP_BUTT);
    strokeShape(c, shackle, g_steel, 6.4f, Shape2D::CAP_BUTT);
    strokeShape(c, shackle, rgba(255, 255, 255, 110), 1.6f, Shape2D::CAP_BUTT);

    Shape2D bodyP = rrect(cx - 23.0f * k, cy - 5.0f * k, 46.0f * k, 39.0f * k, 5.0f);
    c.drop_shadow(0.0f, 3.0f, 1.6f, rgba(50, 32, 0, 150));
    paint(c, bodyP, g_gold, rgba(126, 86, 16, 255), 2.2f);
    c.clear_shadow();
    fillShape(c, rrect(cx - 23.0f * k + 3.0f, cy + 20.0f * k, 46.0f * k - 6.0f, 12.0f, 3.0f),
              rgba(196, 148, 24, 255));
    // corner screws
    for (int i = 0; i < 4; ++i) {
        float sx = cx + ((i & 1) ? 1.0f : -1.0f) * (23.0f * k - 6.0f);
        float sy = cy - 5.0f * k + ((i < 2) ? 6.0f : 39.0f * k - 6.0f);
        disc(c, sx, sy, 1.7f, rgba(120, 86, 20, 255));
        disc(c, sx - 0.5f, sy - 0.5f, 0.7f, rgba(255, 240, 190, 160));
    }
    if (s.quality > 0)
        fillShape(c, bodyP, sheen_grad(cx - 20.0f, cy + 34.0f, cx + 20.0f, cy - 6.0f, 62));

    disc(c, cx, cy + 12.0f * k, 5.4f * k, rgba(48, 36, 76, 255));
    ring(c, cx, cy + 12.0f * k, 5.4f * k, 1.4f, rgba(255, 240, 180, 120));
    fillShape(c, star(cx, cy + 12.0f * k + 6.0f, 3.0f * k, 1.4f * k, 3, PI * 0.5f), rgba(48, 36, 76, 255));
    if (prog > 0.5f)
        disc(c, cx, cy + 12.0f * k, 8.0f * k,
             glow_grad(cx, cy + 12.0f * k, 8.0f * k, 120, 255, 160, q8((prog - 0.5f) * 1.6f)));

    if (prog > 0.01f && prog < 0.99f) {
        c.save(); c.global_alpha(0.7f * std::sin(PI * prog));
        dashedRing(c, cx, cy + 8.0f, 42.0f, 2.0f, rgba(140, 255, 170, 220), 5.0f, 6.0f, -t * 30.0f);
        c.restore();
    } else if (prog >= 0.99f) {
        float p2 = pulse(t, 6.0f);
        ring(c, cx, cy + 4.0f, 30.0f + 8.0f * p2, 2.0f + 2.0f * (1.0f - p2),
             rgba(140, 255, 170, q8(0.5f * (1.0f - p2))));
    }
}

void icon_scroll(Canvas2D& c, float t, const Snap& s) {
    float oy = std::floor(std::sin(t * 1.8f) * 2.0f);
    glow(c, 64, 64, 60, 255, 226, 158, 46);

    Shape2D sheet = rrect(26, 24 + oy, 76, 80, 3.0f);
    c.drop_shadow(0.0f, 3.0f, 1.8f, rgba(40, 22, 6, 150));
    paint(c, sheet, g_parch, rgba(146, 76, 38, 255), 2.0f);
    c.clear_shadow();
    fillShape(c, sheet, g_parchTex);           // repeating fibre texture

    float phase = std::fmod(t * 0.55f, 2.2f);
    for (int i = 0; i < 5; ++i) {
        float f = clamp01(phase * 5.0f - static_cast<float>(i));
        if (f <= 0.0f) continue;
        float y = 44.0f + static_cast<float>(i) * 12.0f + oy;
        float w = (i == 4) ? 34.0f : 56.0f;
        strokeShape(c, seg(36, y, 36 + w * f, y), rgba(112, 66, 36, 220), 2.6f);
    }
    if (s.quality > 0 && phase < 1.1f) {
        int li = static_cast<int>(phase * 5.0f);
        float f = clamp01(phase * 5.0f - static_cast<float>(li));
        if (li < 5 && f > 0.0f && f < 1.0f) {
            float y = 44.0f + static_cast<float>(li) * 12.0f + oy;
            float x = 36.0f + ((li == 4) ? 34.0f : 56.0f) * f;
            fillShape(c, star(x, y - 5.0f, 5.0f, 1.6f, 4, -PI * 0.25f), rgba(90, 60, 30, 235));
        }
    }

    uint32_t rollEdge = rgba(146, 76, 38, 255);
    paint(c, rrect(16, 14 + oy, 96, 16, 8.0f), g_wood, rollEdge, 2.0f);
    paint(c, rrect(16, 98 + oy, 96, 16, 8.0f), g_wood, rollEdge, 2.0f);
    strokeShape(c, seg(24, 20 + oy, 104, 21 + oy), rgba(60, 36, 18, 60), 1.0f);
    strokeShape(c, seg(24, 105 + oy, 104, 104 + oy), rgba(60, 36, 18, 60), 1.0f);
    disc(c, 16,  22 + oy, 9, rgba(126, 84, 44, 255));
    disc(c, 112, 22 + oy, 9, rgba(126, 84, 44, 255));
    disc(c, 16,  106 + oy, 9, rgba(126, 84, 44, 255));
    disc(c, 112, 106 + oy, 9, rgba(126, 84, 44, 255));
    disc(c, 16,  22 + oy, 4, rgba(206, 164, 110, 255));
    disc(c, 112, 106 + oy, 4, rgba(206, 164, 110, 255));

    float sy = 100.0f + oy;
    disc(c, 90, sy, 10.0f, rgba(168, 22, 34, 255));
    disc(c, 90, sy,  7.5f, rgba(206, 34, 46, 255));
    fillShape(c, star(90, sy, 4.4f, 1.8f, 5, -PI * 0.5f), rgba(255, 190, 170, 200));
}

void icon_fire(Canvas2D& c, float t, const Snap& s) {
    float flick = 1.0f + 0.07f * std::sin(t * 17.0f) + 0.045f * std::sin(t * 29.0f + 1.0f);
    glow(c, 64, 66, 63, 255, 116, 12, 130);

    int tongues = (s.quality > 0) ? 7 : 4;
    if (s.quality > 0) { c.save(); c.blend_mode(BlendMode::Screen); }
    for (int i = 0; i < tongues; ++i) {
        float fi  = static_cast<float>(i);
        float a   = t * 2.6f + fi * (TAU / static_cast<float>(tongues));
        float len = 30.0f + 10.0f * std::sin(t * 8.0f + fi * 1.7f);
        float dx = std::cos(a), dy = std::sin(a), nx = -dy, ny = dx;
        Shape2D fl;
        fl.mt(64 + dx * 8 + nx * 12, 64 + dy * 8 + ny * 12)
          .qt(64 + dx * len * 0.7f + nx * 7, 64 + dy * len * 0.7f + ny * 7,
              64 + dx * len, 64 + dy * len)
          .qt(64 + dx * len * 0.7f - nx * 7, 64 + dy * len * 0.7f - ny * 7,
              64 + dx * 8 - nx * 12, 64 + dy * 8 - ny * 12)
          .close();
        uint8_t fa = static_cast<uint8_t>(150 + (i & 1) * 60);
        fillShape(c, std::move(fl), rgba(255, static_cast<uint8_t>(96 + (i % 3) * 56), 0, fa));
    }
    if (s.quality > 0) c.restore();

    disc(c, 64, 64, 30.0f * flick, glow_grad(64, 64, 34.0f * flick, 255, 170, 40, 210));
    disc(c, 64, 64, 24.0f * flick, g_flame);
    disc(c, 64, 66, 15.0f * flick, rgba(255, 208,  74, 255));
    disc(c, 64, 67,  8.0f * flick, rgba(255, 252, 208, 255));

    // rising embers (Screen so they add light over the flame)
    c.save(); c.blend_mode(BlendMode::Screen);
    int embers = (s.quality > 0) ? 6 : 3;
    for (int i = 0; i < embers; ++i) {
        float fi = static_cast<float>(i);
        float ph = std::fmod(t * 0.5f + fi * 0.19f, 1.0f);
        float y  = 96.0f - ph * 74.0f;
        float x  = 64.0f + std::sin(t * 2.0f + fi * 2.4f) * (6.0f + 10.0f * ph);
        disc(c, x, y, 2.2f * (1.0f - ph) + 0.4f,
             rgba(255, static_cast<uint8_t>(170 + 60 * (1.0f - ph)), 90, q8((1.0f - ph) * 0.8f)));
    }
    c.restore();

    if (s.quality >= 2) {
        BloomDisc b[] = {{64, 64, 30, rgba(255,150,40,170)}};
        bloom(c, b, 1);
    }
}

void icon_mana(Canvas2D& c, float t, const Snap& s) {
    float m = clamp01(s.mana / 100.0f);
    const float bar_w = 14.0f, gap = 8.0f, max_h = 86.0f, base_y = 112.0f;
    float start_x = (static_cast<float>(ICON_PX) - (5.0f * bar_w + 4.0f * gap)) * 0.5f;
    bool low = m < 0.25f;
    if (low) glow(c, 64, 64, 62, 255, 84, 70, q8(0.22f + 0.28f * pulse(t, 9.0f)));
    else     glow(c, 64, 64, 62, 74, 148, 255, 56);
    Gradient* liquid = low ? static_cast<Gradient*>(g_lowmana) : static_cast<Gradient*>(g_mana);

    Shape2D inner[5];
    float hh[5];
    for (int i = 0; i < 5; ++i) {
        float fi = static_cast<float>(i);
        float x  = start_x + fi * (bar_w + gap);
        float wob = 0.88f + 0.12f * std::fabs(std::sin(t * (1.8f + fi * 0.45f) + fi * 1.2f));
        float h = clampf(max_h * (0.04f + 0.96f * m) * wob, 3.0f, max_h);
        hh[i] = h;
        paint(c, rrect(x, base_y - max_h, bar_w, max_h, 5.0f),
              rgba(20, 22, 58, 235), rgba(96, 118, 208, 255), 1.4f);
        fillShape(c, rrect(x + 2.0f, base_y - h, bar_w - 4.0f, h - 2.0f, 3.5f), liquid);
        fillShape(c, rrect(x + 2.0f, base_y - h, bar_w - 4.0f, 3.0f, 1.5f), rgba(226, 250, 255, 235));
        inner[i] = rrect(x + 2.0f, base_y - max_h + 2.0f, bar_w - 4.0f, max_h - 4.0f, 3.5f);
    }

    // ONE clip path holding all five glass tubes -> a single layer pass
    ClipPath glass;
    for (int i = 0; i < 5; ++i) glass.add(inner[i]);
    c.set_clip(&glass);
    for (int i = 0; i < 5; ++i) {
        float fi = static_cast<float>(i);
        float x  = start_x + fi * (bar_w + gap);
        fillShape(c, rrect(x + 3.2f, base_y - max_h + 4.0f, 2.4f, max_h - 12.0f, 1.2f),
                  rgba(255, 255, 255, 46));
        if (s.quality > 0 && hh[i] > 14.0f) {
            float by = base_y - 6.0f - std::fmod(t * 16.0f + fi * 9.0f, hh[i] - 10.0f);
            if (by > base_y - hh[i] + 3.0f)
                disc(c, x + bar_w * 0.5f + std::sin(t * 3.0f + fi) * 2.0f, by,
                     1.6f, rgba(235, 250, 255, 190));
        }
    }
    c.clear_clip();
}

void icon_check(Canvas2D& c, float t, const Snap& s) {
    float p = clamp01(s.complete);
    glow(c, 64, 64, 62, 62, 255, 116, q8(0.18f + 0.5f * p));
    disc(c, 64, 64, 52, rgba(mix8(64, 34, p), mix8(70, 214, p), mix8(88, 92, p), 255));
    disc(c, 64, 64, 52, glow_grad(50, 44, 60, 255, 255, 255, static_cast<uint8_t>(40 + 40 * p)));
    ring(c, 64, 64, 52, 4.0f, rgba(255, 224, 128, 255));
    ring(c, 64, 64, 46, 1.6f, rgba(255, 255, 255, 60));

    if (p >= 0.99f) {
        float pr = pulse(t, 3.4f);
        ring(c, 64, 64, 56.0f + 5.0f * pr, 2.4f * (1.0f - pr) + 0.4f,
             rgba(140, 255, 176, q8(0.7f * (1.0f - pr))));
        c.save(); c.global_alpha(0.85f);
        dashedRing(c, 64, 64, 59.0f, 1.8f, rgba(200, 255, 220, 160), 4.0f, 9.0f, t * 24.0f);
        c.restore();
        if (s.quality > 0) {
            c.save(); c.blend_mode(BlendMode::Screen);
            float cf = 0.5f + 0.5f * clamp01(s.combo);
            for (int i = 0; i < 8; ++i) {
                float fi = static_cast<float>(i);
                float a  = t * 1.1f + fi * (TAU / 8.0f);
                float rr = 58.0f + 5.0f * std::sin(t * 2.2f + fi * 1.9f);
                uint32_t col = (i % 3 == 0) ? rgba(255,230,140,200)
                             : (i % 3 == 1) ? rgba(150,255,190,200) : rgba(255,255,255,200);
                fillShape(c, star(64 + std::cos(a) * rr, 64 + std::sin(a) * rr,
                                  2.6f, 1.0f, 4, a), rgba(255,255,255, q8(0.8f * cf)) & 0x00FFFFFFu | (col & 0xFF000000u));
            }
            c.restore();
        }
    }

    const float k = 1.75f;
    float p1x = 64 - 15 * k, p1y = 64 +  1 * k;
    float p2x = 64 -  5 * k, p2y = 64 + 11 * k;
    float p3x = 64 + 16 * k, p3y = 64 - 14 * k;
    float d1 = std::sqrt((p2x - p1x) * (p2x - p1x) + (p2y - p1y) * (p2y - p1y));
    float d2 = std::sqrt((p3x - p2x) * (p3x - p2x) + (p3y - p2y) * (p3y - p2y));
    float cur = p * (d1 + d2);
    if (cur > 0.6f) {
        Shape2D chk;
        chk.mt(p1x, p1y);
        if (cur <= d1) {
            float r = cur / d1;
            chk.lt(lerp(p1x, p2x, r), lerp(p1y, p2y, r));
        } else {
            float r = (cur - d1) / d2;
            chk.lt(p2x, p2y).lt(lerp(p2x, p3x, r), lerp(p2y, p3y, r));
        }
        strokeShape(c, chk, rgba(24, 74, 40, 170), 11.0f);
        strokeShape(c, chk, rgba(255, 255, 255, 255), 8.0f);
        if (p >= 0.99f) strokeShape(c, chk, rgba(200, 255, 220, 120), 3.0f);
    }
}

void icon_wisp(Canvas2D& c, float t, const Snap& s) {
    float by = 50.0f + std::sin(t * 2.6f) * 4.0f;
    glow(c, 64, by + 8, 60, 156, 104, 255, 104);
    for (int i = 0; i < 3; ++i) {
        float fi = static_cast<float>(i);
        float bounce = std::fabs(std::sin(t * 3.6f - fi * 0.5f)) * 13.0f;
        disc(c, 44.0f + fi * 20.0f, 110.0f - bounce, 6.0f - fi,
             rgba(150, 100, 255, static_cast<uint8_t>(235 - i * 55)));
    }

    auto body = [&](float yy) {
        Shape2D b;
        b.mt(36, yy + 26);
        b.ct(36, yy - 14, 92, yy - 14, 92, yy + 26);
        float hem = yy + 26.0f;
        for (int i = 0; i < 4; ++i) {
            float x0 = 92.0f - static_cast<float>(i) * 14.0f;
            float x1 = x0 - 14.0f;
            float dip = 9.0f + 3.0f * std::sin(t * 5.0f + static_cast<float>(i));
            b.qt((x0 + x1) * 0.5f, hem + ((i & 1) ? dip : -dip * 0.4f), x1, hem);
        }
        b.close();
        return b;
    };

    // motion trail via globalAlpha (cheap afterimages)
    if (s.quality > 0) {
        c.save();
        c.global_alpha(0.10f); fillShape(c, body(by + 10.0f), rgba(150,100,255,255));
        c.global_alpha(0.18f); fillShape(c, body(by + 5.0f),  rgba(160,110,255,255));
        c.restore();
    }

    // luminance mask fades the hem out like a real ghost
    c.set_mask(&g_wispFade);
    paint(c, body(by), g_ghost, rgba(96, 54, 190, 200), 2.0f);
    c.clear_mask();

    float blink = (std::fmod(t, 3.7f) < 0.12f) ? 0.15f : 1.0f;
    for (int i = 0; i < 2; ++i) {
        float ex = 54.0f + static_cast<float>(i) * 20.0f;
        fillShape(c, ellipse(ex, by + 2, 6.2f, 7.0f * blink), rgba(255, 255, 255, 255));
        disc(c, ex + std::sin(t * 1.6f) * 1.6f, by + 3.0f, 3.0f * blink, rgba(38, 12, 74, 255));
    }
    if (s.quality > 0) {
        arcSeg(c, 64, by + 14, 8.0f, PI * 0.15f, PI * 0.85f, 2.4f, rgba(60, 24, 110, 200));
        c.save(); c.blend_mode(BlendMode::Screen);
        for (int i = 0; i < 3; ++i) {
            float fi = static_cast<float>(i);
            float a = t * 1.7f + fi * (TAU / 3.0f);
            disc(c, 64 + std::cos(a) * 34.0f, by + 8 + std::sin(a) * 22.0f, 1.8f, rgba(220,200,255,150));
        }
        c.restore();
    }
    if (s.quality >= 2) {
        BloomDisc b[] = {{64, by + 8, 26, rgba(170,120,255,120)}};
        bloom(c, b, 1);
    }
}

void icon_shield(Canvas2D& c, float t, const Snap& s) {
    float a = clamp01(s.shield);
    glow(c, 64, 64, 60, 110, 190, 255, static_cast<uint8_t>(40 + 90 * a));

    Shape2D sh;
    sh.mt(64, 16).lt(104, 30)
      .ct(104, 76, 88, 100, 64, 114)
      .ct(40, 100, 24, 76, 24, 30)
      .close();
    c.drop_shadow(0.0f, 3.0f, 1.6f, rgba(6, 20, 50, 160));
    paint(c, sh, g_shieldg, rgba(206, 232, 255, 255), 3.0f);
    c.clear_shadow();

    Shape2D inner;
    inner.mt(64, 28).lt(94, 39).ct(94, 74, 82, 92, 64, 103)
         .ct(46, 92, 34, 74, 34, 39).close();
    strokeShape(c, std::move(inner), rgba(255, 255, 255, 90), 1.8f);

    // rivets
    const float riv[][2] = {{42, 32}, {86, 32}, {31, 55}, {97, 55}};
    for (auto& p : riv) {
        disc(c, p[0], p[1], 2.0f, rgba(210, 235, 255, 230));
        ring(c, p[0], p[1], 2.0f, 1.0f, rgba(30, 70, 150, 180));
    }

    paint(c, star(64, 62, 20.0f, 6.5f, 4, -PI * 0.5f),
          rgba(236, 248, 255, static_cast<uint8_t>(120 + 120 * a)), rgba(30, 70, 150, 200), 1.6f);

    if (s.quality > 0) {
        float sx = 20.0f + std::fmod(t * 46.0f, 150.0f);
        fillShape(c, sh, sheen_grad(sx - 14.0f, 0.0f, sx + 14.0f, 128.0f, 70));
    }
    if (a > 0.0f) {
        c.save(); c.global_alpha(a);
        dashedRing(c, 64, 64, 56.0f, 2.0f, rgba(160, 220, 255, 200), 4.0f, 7.0f, -t * 26.0f);
        c.restore();
        float pr = pulse(t, 5.0f);
        ring(c, 64, 64, 54.0f + 4.0f * pr, 2.0f, rgba(160, 220, 255, q8(0.4f * a * (1.0f - pr))));
    }
}

void icon_potion(Canvas2D& c, float t, const Snap& s) {
    glow(c, 64, 76, 56, 110, 240, 140, 76);
    paint(c, rrect(54, 14, 20, 14, 3.0f), g_wood, rgba(90, 56, 28, 255), 1.6f);
    paint(c, rrect(56, 26, 16, 20, 3.0f), g_glass, rgba(190, 220, 240, 200), 1.4f);

    Shape2D flask;
    flask.mt(56, 40).lt(56, 56)
         .ct(30, 66, 28, 104, 64, 112)
         .ct(100, 104, 98, 66, 72, 56)
         .lt(72, 40).close();
    c.drop_shadow(0.0f, 3.0f, 1.6f, rgba(6, 40, 20, 150));
    paint(c, flask, g_glass, rgba(206, 232, 246, 235), 2.2f);
    c.clear_shadow();

    // liquid with a live sine surface, clipped to the flask interior
    ClipPath clip; clip.add(flask);
    c.set_clip(&clip);
    float fill = 0.62f + 0.05f * std::sin(t * 1.9f);
    float sy = lerp(108.0f, 60.0f, fill);
    fillShape(c, waveRect(28, 100, sy + 2.0f, 116, 2.0f, t * 2.2f + 1.7f, 8.0f), rgba(190, 255, 170, 90));
    fillShape(c, waveRect(28, 100, sy, 116, 2.4f, t * 2.2f, 7.0f), g_poison);
    strokeShape(c, waveLine(28, 100, sy, 2.4f, t * 2.2f, 7.0f), rgba(230, 255, 220, 140), 1.4f);
    if (s.quality > 0) {
        for (int i = 0; i < 4; ++i) {
            float fi = static_cast<float>(i);
            float ph = std::fmod(t * 0.7f + fi * 0.27f, 1.0f);
            float bx = 64.0f + std::sin(t * 2.2f + fi * 2.0f) * 12.0f;
            float byy = lerp(106.0f, sy + 3.0f, ph);
            disc(c, bx, byy, 1.4f + 1.6f * (1.0f - ph), rgba(232, 255, 220, q8(0.75f * (1.0f - ph))));
        }
    }
    c.clear_clip();

    arcSeg(c, 54, 84, 22.0f, PI * 0.72f, PI * 1.18f, 3.4f, rgba(255, 255, 255, 130));
    disc(c, 48, 68, 3.4f, rgba(255, 255, 255, 120));
}

void icon_coin(Canvas2D& c, float t, const Snap& s) {
    float spin = std::cos(t * 2.4f);                 // fake Y rotation
    float rx   = std::fabs(spin) * 40.0f + 6.0f;
    glow(c, 64, 64, 58, 255, 214, 96, 82);

    // coin thickness: a darker rim ellipse peeking out behind the face
    float off = 2.6f * ((spin >= 0.0f) ? 1.0f : -1.0f);
    fillShape(c, ellipse(64 - off, 64, rx, 42.0f), rgba(150, 102, 18, 255));

    Shape2D face = ellipse(64, 64, rx, 42.0f);
    c.drop_shadow(0.0f, 2.0f, 1.4f, rgba(70, 44, 0, 150));
    paint(c, face, g_coin, rgba(140, 96, 18, 255), 2.4f);
    c.clear_shadow();

    if (rx < 14.0f) {                                // reeded edge, edge-on
        for (int i = -2; i <= 2; ++i)
            strokeShape(c, seg(64 + i * 2.4f, 64 - 36.0f, 64 + i * 2.4f, 64 + 36.0f),
                        rgba(120, 80, 14, 100), 1.0f, Shape2D::CAP_BUTT);
    } else if (rx > 12.0f) {
        strokeShape(c, ellipse(64, 64, rx * 0.74f, 31.0f), rgba(160, 112, 24, 220), 1.8f);
        paint(c, star(64, 64, rx * 0.52f, rx * 0.20f, 4, -PI * 0.5f),
              rgba(255, 248, 206, 235), rgba(150, 104, 20, 200), 1.2f);
    }
    if (s.quality > 0 && spin > 0.0f)
        fillShape(c, face, sheen_grad(64 - rx, 20.0f, 64 + rx, 108.0f, static_cast<uint8_t>(90 * spin)));
    if (spin > 0.75f) {                              // specular glint
        float g = (spin - 0.75f) / 0.25f;
        c.save(); c.blend_mode(BlendMode::Screen);
        fillShape(c, star(64 + rx * 0.45f, 44.0f, 5.5f * g, 1.6f * g, 4, -PI * 0.5f),
                  rgba(255, 255, 255, q8(0.9f * g)));
        c.restore();
    }
    if (s.coins > 0.0f) {
        float pr = pulse(t, 4.0f);
        ring(c, 64, 64, 50.0f + 4.0f * pr, 1.8f, rgba(255, 236, 160, q8(0.35f * (1.0f - pr))));
    }
}

void icon_skull(Canvas2D& c, float t, const Snap& s) {
    float bob = std::sin(t * 2.2f) * 2.0f;
    glow(c, 64, 64 + bob, 58, 226, 220, 200, 54);
    glow(c, 64, 60 + bob, 40, 190, 40, 60, static_cast<uint8_t>(28 + 26 * pulse(t, 5.0f)));

    Shape2D cranium;
    cranium.mt(30, 62 + bob)
           .ct(30, 20 + bob, 98, 20 + bob, 98, 62 + bob)
           .ct(98, 78 + bob, 88, 84 + bob, 84, 86 + bob)
           .lt(84, 100 + bob).lt(44, 100 + bob).lt(44, 86 + bob)
           .ct(40, 84 + bob, 30, 78 + bob, 30, 62 + bob)
           .close();
    c.drop_shadow(0.0f, 3.0f, 1.6f, rgba(20, 10, 6, 160));
    paint(c, cranium, g_bone, rgba(110, 98, 80, 255), 2.4f);
    c.clear_shadow();

    // hairline cracks for character
    Shape2D crack;
    crack.mt(70, 26 + bob).lt(74, 36 + bob).lt(70, 44 + bob);
    crack.mt(38, 40 + bob).lt(42, 48 + bob);
    strokeShape(c, std::move(crack), rgba(120, 108, 88, 140), 1.0f);

    for (int i = 0; i < 2; ++i) {
        float fi = static_cast<float>(i);
        float ex = 48.0f + fi * 32.0f;
        paint(c, ellipse(ex, 62 + bob, 12.0f, 13.0f), rgba(24, 18, 26, 255), rgba(90, 78, 62, 255), 1.6f);
        float e = 0.55f + 0.45f * pulse(t + fi * 0.6f, 6.0f);
        c.save(); c.blend_mode(BlendMode::Screen);
        disc(c, ex, 63 + bob, 5.0f * e, glow_grad(ex, 63 + bob, 7.0f, 255, 70, 60, q8(0.9f * e)));
        c.restore();
    }
    fillShape(c, star(64, 78 + bob, 6.0f, 2.4f, 3, PI * 0.5f), rgba(30, 24, 30, 255));
    for (int i = 0; i < 5; ++i) {
        float x = 48.0f + static_cast<float>(i) * 8.0f;
        paint(c, rrect(x, 90 + bob, 6.0f, 10.0f, 2.0f), rgba(238, 230, 210, 255), rgba(110, 98, 80, 255), 1.2f);
    }
    if (s.quality > 0) strokeShape(c, cranium, rgba(255, 255, 255, 50), 1.2f);
}

void icon_map(Canvas2D& c, float t, const Snap& s) {
    const float cx = 64.0f, cy = 64.0f, R = 57.0f;
    float ext   = (s.extent > 1.0f) ? s.extent : 26.0f;
    float scale = R / ext;

    disc(c, cx, cy, R + 4.0f, rgba(8, 10, 20, 255));
    disc(c, cx, cy, R, g_mapbg);

    // grid + range rings + radar sweep, all clipped to the map disc
    Shape2D mapDisc = circle(cx, cy, R);
    ClipPath clip; clip.add(mapDisc);
    c.set_clip(&clip);
    fillShape(c, circle(cx, cy, R), g_gridPat);
    dashedRing(c, cx, cy, R * 0.5f, 1.0f, rgba(110,150,220,42), 2.0f, 5.0f, 0.0f);
    dashedRing(c, cx, cy, R * 0.8f, 1.0f, rgba(110,150,220,28), 2.0f, 5.0f, 0.0f);
    strokeShape(c, seg(cx - R, cy, cx + R, cy), rgba(110,150,220,30), 1.0f, Shape2D::CAP_BUTT);
    strokeShape(c, seg(cx, cy - R, cx, cy + R), rgba(110,150,220,30), 1.0f, Shape2D::CAP_BUTT);
    if (s.quality > 0) {
        g_radar->startAngle = t * 1.1f;
        c.save(); c.blend_mode(BlendMode::Screen);
        fillShape(c, circle(cx, cy, R), g_radar);
        c.restore();
    }
    c.clear_clip();

    // heading-up projection: +x = player right, -y = player forward
    float cyaw = std::cos(s.yaw), syaw = std::sin(s.yaw);
    auto toMap = [&](float wx, float wz, float& mx, float& my) -> bool {
        float dx = wx - s.px, dz = wz - s.pz;
        float rx =  dx * cyaw - dz * syaw;
        float fy = -dx * syaw - dz * cyaw;
        mx = cx + rx * scale;
        my = cy - fy * scale;
        return (rx * rx + fy * fy) <= (ext * ext);
    };

    const float* e = s.ent ? s.ent : g_state + HDR;
    int n = s.count;

    // pass 1: scenery
    for (int i = 0; i < n; ++i) {
        int kind = static_cast<int>(e[i * 3 + 2]);
        if (kind != K_TREE && kind != K_GATE) continue;
        float mx, my;
        if (!toMap(e[i * 3], e[i * 3 + 1], mx, my)) continue;
        if (kind == K_TREE) disc(c, mx, my, 2.2f, rgba(70, 132, 82, 200));
        else                disc(c, mx, my, 3.0f, rgba(150, 150, 176, 230));
    }

    // pass 2: points of interest, each with its own bloom
    float bestObj = 1e9f, objx = cx, objy = cy;
    for (int i = 0; i < n; ++i) {
        float wx = e[i * 3], wz = e[i * 3 + 1];
        int kind = static_cast<int>(e[i * 3 + 2]);
        if (kind == K_TREE || kind == K_GATE) continue;
        float mx, my;
        if (!toMap(wx, wz, mx, my)) continue;
        uint32_t col; float rad; uint8_t halo = 90;
        switch (kind) {
            case K_GEAR:   col = rgba(255, 214,  96, 255); rad = 4.0f; halo = 150; break;
            case K_HEART:  col = rgba(255,  86, 122, 255); rad = 3.6f; halo = 130; break;
            case K_WISP:   col = rgba(178, 124, 255, 255); rad = 3.2f; halo = 120; break;
            case K_BRUTE:  col = rgba(255,  92,  92, 255); rad = 4.2f; halo = 150; break;
            case K_NPC:    col = rgba(120, 226, 176, 255); rad = 3.0f; halo = 100; break;
            case K_PORTAL: col = rgba(150, 110, 255, 255); rad = 4.6f; halo = 170; break;
            case K_POTION: col = rgba(120, 240, 150, 255); rad = 2.8f; halo = 100; break;
            case K_COIN:   col = rgba(255, 232, 150, 255); rad = 2.6f; halo = 100; break;
            case K_SHIELD: col = rgba(140, 206, 255, 255); rad = 3.0f; halo = 110; break;
            case K_FIRE:   col = rgba(255, 168,  60, 255); rad = 2.4f; halo =  90; break;
            default:       col = rgba(200, 200, 220, 255); rad = 2.4f; halo =  70; break;
        }
        disc(c, mx, my, rad + 3.0f, glow_grad(mx, my, rad + 3.0f,
             static_cast<uint8_t>( col        & 0xFFu),
             static_cast<uint8_t>((col >>  8) & 0xFFu),
             static_cast<uint8_t>((col >> 16) & 0xFFu), halo));
        disc(c, mx, my, rad, col);
        if (kind == K_GEAR || (kind == K_PORTAL && s.unlock >= 0.99f)) {
            float d = (wx - s.px) * (wx - s.px) + (wz - s.pz) * (wz - s.pz);
            if (d < bestObj) { bestObj = d; objx = mx; objy = my; }
        }
    }

    // depth fog toward the rim
    if (s.quality > 0) fillShape(c, circle(cx, cy, R), g_mapFog);

    // objective route: dashed polyline + mid chevrons + end arrow (markers)
    if (bestObj < 1e8f) {
        float dx = objx - cx, dy = objy - cy;
        float d = std::sqrt(dx * dx + dy * dy);
        if (d > 24.0f) {
            float ux = dx / d, uy = dy / d;
            float sx = cx + ux * 10.0f, sy = cy + uy * 10.0f;
            float len = d - 19.0f;
            Shape2D route;
            route.mt(sx, sy);
            int steps = std::max(1, static_cast<int>(len / 14.0f));
            for (int i = 1; i <= steps; ++i) {
                float u = static_cast<float>(i) / steps;
                route.lt(sx + ux * len * u, sy + uy * len * u);
            }
            route.line_width = 1.4f; route.line_cap = Shape2D::CAP_ROUND;
            route.set_dash_array({2.0f, 5.0f});
            route.dash_offset = -std::fmod(t * 16.0f, 7.0f);
            c.set_markers(nullptr, (s.quality > 0) ? &g_routeChev : nullptr, &g_routeArrow);
            c.fill_style(NONE).stroke_style(rgba(255, 240, 170, 150)).path(route);
            c.clear_markers();
        }
        float pr = pulse(t, 4.5f);
        ring(c, objx, objy, 6.0f + 4.0f * pr, 1.6f, rgba(255, 240, 170, q8(0.85f * (1.0f - pr))));
    }

    // north marker (world -Z, the gate side)
    {
        float nx = cx + syaw * (R - 7.0f);
        float ny = cy - cyaw * (R - 7.0f);
        fillShape(c, star(nx, ny, 4.6f, 1.8f, 3,
                  static_cast<float>(std::atan2(cyaw, syaw)) - PI * 0.5f), rgba(226, 240, 255, 220));
    }

    // player arrow, dead centre, always pointing up
    Shape2D arrow;
    arrow.mt(cx, cy - 8.0f).lt(cx + 5.6f, cy + 6.0f).lt(cx, cy + 2.6f).lt(cx - 5.6f, cy + 6.0f).close();
    paint(c, std::move(arrow), rgba(255, 255, 255, 255), rgba(24, 40, 80, 255), 1.4f);
    if (s.shield > 0.0f)
        ring(c, cx, cy, 12.0f, 1.8f, rgba(150, 214, 255, q8(0.4f + 0.5f * s.shield)));
    ring(c, cx, cy, R,       2.6f, rgba(126, 166, 236, 200));
    ring(c, cx, cy, R + 2.6f, 1.4f, rgba(20, 26, 46, 255));
}

// ======================================================================
// frame
// ======================================================================
typedef void (*IconFn)(Canvas2D&, float, const Snap&);
const IconFn kDraw[ICON_COUNT] = {
    icon_portal, icon_heart, icon_gear,  icon_lock,   icon_scroll,
    icon_fire,   icon_mana,  icon_check, icon_wisp,   icon_shield,
    icon_potion, icon_coin,  icon_skull, icon_map
};

Snap read_snap(uint32_t packed) {
    Snap s;
    if (g_state[H_MAGIC] == 1.0f) {
        s.health   = g_state[H_HEALTH];
        s.mana     = g_state[H_MANA];
        s.unlock   = clamp01(g_state[H_UNLOCK]);
        s.complete = clamp01(g_state[H_COMPLETE]);
        s.shield   = clamp01(g_state[H_SHIELD]);
        s.coins    = g_state[H_COINS];
        s.combo    = clamp01(g_state[H_COMBO]);
        s.px       = g_state[H_PX];
        s.pz       = g_state[H_PZ];
        s.yaw      = g_state[H_YAW];
        s.extent   = g_state[H_EXTENT];
        int qq     = static_cast<int>(g_state[H_QUALITY]);
        s.quality  = (qq < 0) ? 0 : (qq > 2 ? 2 : qq);
        int cnt    = static_cast<int>(g_state[H_ECOUNT]);
        s.count    = (cnt < 0) ? 0 : (cnt > MAX_ENT ? MAX_ENT : cnt);
        s.ent      = g_state + HDR;
    } else if (packed != 0u) {           // legacy 4-byte payload
        s.health   = static_cast<float>(packed & 0xFFu);
        s.mana     = static_cast<float>((packed >>  8) & 0xFFu);
        s.unlock   = static_cast<float>((packed >> 16) & 0xFFu) / 100.0f;
        s.complete = static_cast<float>((packed >> 24) & 0xFFu) / 100.0f;
    }
    if (!(s.extent > 1.0f)) s.extent = 26.0f;
    return s;
}

} // namespace

// ======================================================================
// exports (protocol unchanged)
// ======================================================================
ag_export(init_icons)
uint32_t init_icons() {
    build_art();
    for (int i = 0; i < HDR; ++i) g_state[i] = 0.0f;
    g_state[H_HEALTH]  = 100.0f;
    g_state[H_MANA]    = 100.0f;
    g_state[H_EXTENT]  = 26.0f;
    g_state[H_QUALITY] = 1.0f;
    g_state[H_MAGIC]   = 1.0f;
    for (int i = 0; i < ICON_COUNT; ++i) {
        if (g_icons[i]) { delete g_icons[i]; g_icons[i] = nullptr; }
        g_icons[i] = new Canvas2D(ICON_PX, ICON_PX);
        g_icons[i]->clear(rgba(0, 0, 0, 0));
    }
    return static_cast<uint32_t>(ICON_COUNT);
}

ag_export(get_icon_ptr)
uint32_t get_icon_ptr(uint32_t id) {
    if (id >= static_cast<uint32_t>(ICON_COUNT) || !g_icons[id]) return 0u;
    return static_cast<uint32_t>(reinterpret_cast<uintptr_t>(g_icons[id]->get_buffer()));
}

ag_export(get_icon_size)
uint32_t get_icon_size() { return static_cast<uint32_t>(ICON_PX); }

ag_export(get_icon_count)
uint32_t get_icon_count() { return static_cast<uint32_t>(ICON_COUNT); }

ag_export(get_state_ptr)
uint32_t get_state_ptr() { return static_cast<uint32_t>(reinterpret_cast<uintptr_t>(&g_state[0])); }

ag_export(get_state_len)
uint32_t get_state_len() { return static_cast<uint32_t>(STATE_FLOATS); }

ag_export(render_all)
uint32_t render_all(uint32_t time_ms, uint32_t packed) {
    if (!g_icons[0]) return 0u;
    build_art();
    const float t = static_cast<float>(time_ms) * 0.001f;
    Snap s = read_snap(packed);
    for (int i = 0; i < ICON_COUNT; ++i) {
        Canvas2D& c = *g_icons[i];
        c.clear(rgba(0, 0, 0, 0));
        // defensive per-icon state reset (styles are sticky on the context)
        c.resetTransform();
        c.blend_mode(BlendMode::Normal).global_alpha(1.0f).fill_rule(FillRule::NonZero);
        c.clear_shadow(); c.clear_clip(); c.clear_mask(); c.clear_markers(); c.clear_filter();
        kDraw[i](c, t, s);
    }
    return 1u;
}
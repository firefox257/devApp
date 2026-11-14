// ./slamOpencvTest.cpp
// MAIN TEST ORCHESTRATOR - Shared utilities + dispatches to 3 test suites
#define DEBUG
#include <iostream>
#include <cassert>
#include <vector>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include "slamOpencv.cpp"

// ============================================================================
// AUTOGEN INTEGRATION
// ============================================================================
#include <autogen.hpp>
ag_dedicated_thread_count(1);
ag_undedicated_thread_count(2);
#define LOG msginfo <<

// ============================================================================
// SHARED TEST UTILITIES (used by all 3 test suites)
// ============================================================================
static size_t g_test_allocated = 0;
extern "C" {
void* test_wrap_malloc(size_t size) {
    void* ptr = malloc(size);
    if (ptr) g_test_allocated += size;
    return ptr;
}
void test_wrap_free(void* ptr) {
    free(ptr);
}
size_t test_get_allocated() {
    return g_test_allocated;
}
}

// Shared draw_dot helper used by many pipeline/algorithm tests
void test_draw_dot(std::vector<uint8_t>& img, int x, int y, int id, int w, int h) {
    for (int dy = -8; dy <= 8; ++dy) {
        for (int dx = -8; dx <= 8; ++dx) {
            int px = x + dx;
            int py = y + dy;
            if (px >= 0 && px < w && py >= 0 && py < h) {
                int dist_sq = dx * dx + dy * dy;
                if (dist_sq <= 4) img[py * w + px] = 255;
                else if (dist_sq <= 25) img[py * w + px] = 0;
                else {
                    int pattern = (id * 73 + dx * 41 + dy * 29) % 256;
                    img[py * w + px] = (pattern < 128) ? 0 : 255;
                }
            }
        }
    }
}

// Shared small-dot variant used by feature-extraction tests
void test_draw_small_dot(std::vector<uint8_t>& img, int x, int y, int id, int w, int h) {
    for (int dy = -8; dy <= 8; ++dy) {
        for (int dx = -8; dx <= 8; ++dx) {
            int px = x + dx;
            int py = y + dy;
            if (px >= 0 && px < w && py >= 0 && py < h) {
                int dist_sq = dx * dx + dy * dy;
                if (dist_sq <= 4) img[py * w + px] = 255;
                else if (dist_sq <= 25) img[py * w + px] = 0;
                else {
                    int pattern = (id * 73 + dx * 41 + dy * 29) % 256;
                    img[py * w + px] = (pattern < 128) ? 0 : 255;
                }
            }
        }
    }
}

// ============================================================================
// INCLUDE THE 3 TEST SUITES
// ============================================================================
#include "slamOpencvTestCore.cpp"
#include "slamOpencvTestAlgorithms.cpp"
#include "slamOpencvTestPipeline.cpp"

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================
ag_export(run_slam_tests)
int run_slam_tests() {
    LOG "Running Native SLAM C++ Unit Tests (Phase 2 Hardened - 62 Tests)...\n";
    LOG "================================================================\n";
    run_core_tests();
    run_algorithm_tests();
    run_pipeline_tests();
    LOG "================================================================\n";
    LOG "\n✅ All 62 Phase 2 Hardened native C++ tests passed successfully!\n";
    return 0;
}
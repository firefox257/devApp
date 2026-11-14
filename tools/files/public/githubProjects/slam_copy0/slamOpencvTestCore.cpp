// ./slamOpencvTestCore.cpp
// TEST SUITE 1: Core Math, Vector Ops, Convex/Concave Hulls, SVD (11 tests)
#ifndef SLAM_OPENCV_TEST_CORE_CPP
#define SLAM_OPENCV_TEST_CORE_CPP

#include <iostream>
#include <cassert>
#include <vector>
#include <cmath>
#include "slamOpencv.cpp"

#define LOG msginfo <<

// Shared utilities from slamOpencvTest.cpp
extern size_t test_get_allocated();
extern void* test_wrap_malloc(size_t size);
extern void test_wrap_free(void* ptr);

void run_core_tests() {
    LOG "\n=== SUITE 1: CORE MATH & GEOMETRY (11 tests) ===\n";

    // ========================================================================
    // TEST 1: Memory Tracking
    // ========================================================================
    LOG "[1/62] Testing Memory Tracking...\n";
    size_t initial = test_get_allocated();
    void* ptr = test_wrap_malloc(1024);
    assert(ptr != nullptr);
    assert(test_get_allocated() == initial + 1024);
    test_wrap_free(ptr);
    LOG "[1/62] Testing Memory Tracking... PASS\n";

    // ========================================================================
    // TEST 2: Vector Math
    // ========================================================================
    LOG "[2/62] Testing Vector Math...\n";
    Vec3 v1 = {1.0f, 0.0f, 0.0f};
    Vec3 v2 = {0.0f, 1.0f, 0.0f};
    Vec3 v3 = cross(v1, v2);
    assert(fabs(v3.x - 0.0f) < 1e-6f && fabs(v3.y - 0.0f) < 1e-6f && fabs(v3.z - 1.0f) < 1e-6f);
    LOG "[2/62] Testing Vector Math... PASS\n";

    // ========================================================================
    // TEST 3: Convex Hull
    // ========================================================================
    LOG "[3/62] Testing Convex Hull...\n";
    std::vector<Point2D> pts = {{0, 0}, {1, 0}, {1, 1}, {0, 1}, {0.5, 0.5}};
    std::vector<Point2D> hull_pts = compute_convex_hull(pts);
    assert(hull_pts.size() == 4);
    LOG "[3/62] Testing Convex Hull... PASS\n";

    // ========================================================================
    // TEST 4: Gravity Alignment & Rejection
    // ========================================================================
    LOG "[4/62] Testing Gravity Alignment & Rejection...\n";
    Vec3 gravity = {0.0f, -1.0f, 0.0f};
    Vec3 floor_normal = {0.0f, 1.0f, 0.0f};
    float cos_5deg = cos(5.0f * 3.14159265f / 180.0f);
    assert(fabs(dot(floor_normal, gravity)) >= cos_5deg);
    Vec3 wall_normal = {1.0f, 0.0f, 0.0f};
    assert(fabs(dot(wall_normal, gravity)) < cos_5deg);
    LOG "[4/62] Testing Gravity Alignment & Rejection... PASS\n";

    // ========================================================================
    // TEST 17: Concave Hull (Alpha Shape) vs Convex Hull
    // ========================================================================
    LOG "[17/62] Testing Concave Hull (Alpha Shape) vs Convex Hull...\n";
    std::vector<Point2D> c_shape = {
        {0, 0}, {0, 1}, {0, 2}, {0, 3}, {0, 4}, {1, 4}, {2, 4}, {3, 4},
        {3, 3}, {3, 2}, {3, 1}, {3, 0}, {2, 0}, {1, 0},
        {1, 1}, {1, 2}, {1, 3}, {2, 1}, {2, 2}, {2, 3}
    };
    std::vector<Point2D> convex = compute_convex_hull(c_shape);
    std::vector<Point2D> concave = compute_concave_hull(c_shape, 1.5f);
    LOG "[DEBUG Test 17] Convex hull size: " << convex.size() << ", Concave hull size: " << concave.size() << "\n";
    assert(concave.size() > convex.size());
    LOG "[17/62] Testing Concave Hull (Alpha Shape) vs Convex Hull... PASS\n";

    // ========================================================================
    // TEST 32: SVD Edge Case: Zero Matrix
    // ========================================================================
    LOG "[32/62] Testing SVD Edge Case: Zero Matrix...\n";
    float zero_A[9] = {0, 0, 0, 0, 0, 0, 0, 0, 0};
    float zero_U[9], zero_S[3], zero_V[9];
    svd3x3(zero_A, zero_U, zero_S, zero_V);
    assert(zero_S[0] < 1e-6f && zero_S[1] < 1e-6f && zero_S[2] < 1e-6f);
    LOG "[32/62] Testing SVD Edge Case: Zero Matrix... PASS\n";

    // ========================================================================
    // TEST 33: Concave Hull with Collinear Points
    // ========================================================================
    LOG "[33/62] Testing Concave Hull with Collinear Points...\n";
    std::vector<Point2D> collinear_pts = {{0, 0}, {1, 0}, {2, 0}, {3, 0}, {4, 0}};
    std::vector<Point2D> collinear_hull = compute_concave_hull(collinear_pts, 1.5f);
    assert(collinear_hull.size() == 2);
    LOG "[33/62] Testing Concave Hull with Collinear Points... PASS\n";

    // ========================================================================
    // TEST 42: SVD Robustness with NaN/Inf
    // ========================================================================
    LOG "[42/62] Testing SVD Robustness with NaN/Inf...\n";
    float nan_A[9] = {1.0f, 2.0f, 3.0f, 4.0f, std::nanf(""), 6.0f, 7.0f, 8.0f, 9.0f};
    float nan_U[9], nan_S[3], nan_V[9];
    svd3x3(nan_A, nan_U, nan_S, nan_V);
    assert(nan_S[0] == 0.0f && nan_S[1] == 0.0f && nan_S[2] == 0.0f);
    assert(nan_U[0] == 1.0f && nan_U[4] == 1.0f && nan_U[8] == 1.0f);
    LOG "[42/62] Testing SVD Robustness with NaN/Inf... PASS\n";

    // ========================================================================
    // TEST 43: Concave Hull with Duplicate Points
    // ========================================================================
    LOG "[43/62] Testing Concave Hull with Duplicate Points...\n";
    std::vector<Point2D> dup_pts = {{0, 0}, {0, 0}, {1, 0}, {1, 0}, {0, 1}, {0, 1}, {1, 1}, {1, 1}};
    std::vector<Point2D> dup_hull = compute_concave_hull(dup_pts, 1.5f);
    assert(dup_hull.size() == 4);
    LOG "[43/62] Testing Concave Hull with Duplicate Points... PASS\n";

    // ========================================================================
    // TEST 53: SVD with Identity Matrix
    // ========================================================================
    LOG "[53/62] Testing SVD with Identity Matrix...\n";
    float id_A[9] = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    float id_U[9], id_S[3], id_V[9];
    svd3x3(id_A, id_U, id_S, id_V);
    assert(fabs(id_S[0] - 1.0f) < 1e-5f && fabs(id_S[1] - 1.0f) < 1e-5f && fabs(id_S[2] - 1.0f) < 1e-5f);
    LOG "[53/62] Testing SVD with Identity Matrix... PASS\n";

    // ========================================================================
    // TEST 54: Concave Hull with Perfect Circle
    // ========================================================================
    LOG "[54/62] Testing Concave Hull with Perfect Circle...\n";
    std::vector<Point2D> circle_pts;
    for (int i = 0; i < 20; ++i) {
        float angle = 2.0f * 3.14159265f * (float)i / 20.0f;
        circle_pts.push_back({cos(angle), sin(angle)});
    }
    std::vector<Point2D> circle_hull = compute_concave_hull(circle_pts, 0.5f);
    assert(circle_hull.size() >= 10);
    LOG "[54/62] Testing Concave Hull with Perfect Circle... PASS\n";

    LOG "=== SUITE 1 COMPLETE (11/62 tests) ===\n";
}

#endif // SLAM_OPENCV_TEST_CORE_CPP
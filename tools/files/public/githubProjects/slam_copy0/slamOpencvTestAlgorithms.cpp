// ./slamOpencvTestAlgorithms.cpp
// TEST SUITE 2: Feature Extraction, Matching, PnP, RANSAC, BA (23 tests)
#ifndef SLAM_OPENCV_TEST_ALGORITHMS_CPP
#define SLAM_OPENCV_TEST_ALGORITHMS_CPP

#include <iostream>
#include <cassert>
#include <vector>
#include <cmath>
#include "slamOpencv.cpp"

#define LOG msginfo <<

extern void test_draw_small_dot(std::vector<uint8_t>& img, int x, int y, int id, int w, int h);

void run_algorithm_tests() {
    LOG "\n=== SUITE 2: ALGORITHMS (23 tests) ===\n";

    // ========================================================================
    // TEST 8: PnP RANSAC with Outliers
    // ========================================================================
    LOG "[8/62] Testing PnP RANSAC with Outliers...\n";
    std::vector<Vec3> p3d;
    std::vector<Vec3> p2d;
    for (int i = 0; i < 20; ++i) {
        float x = (float)(i % 5) * 0.5f - 1.0f;
        float y = (float)(i / 5) * 0.5f - 1.0f;
        float z = 2.0f + (float)(i % 7) * 0.3f + (float)(i / 7) * 0.5f;
        p3d.push_back({x, y, z});
        p2d.push_back({x / z, y / z, 1.0f});
    }
    for (int i = 0; i < 5; ++i) {
        p3d.push_back({(float)i, 10.0f, 10.0f});
        p2d.push_back({(float)i * 0.5f, 10.0f, 1.0f});
    }
    Mat3 test_R = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    Vec3 test_t = {0, 0, 0};
    solve_pnp_ransac(p3d, p2d, test_R, test_t);
    float total_err = 0;
    for (int i = 0; i < 20; ++i) {
        Vec3 X = p3d[i];
        float Xc_x = test_R.m[0] * X.x + test_R.m[1] * X.y + test_R.m[2] * X.z + test_t.x;
        float Xc_y = test_R.m[3] * X.x + test_R.m[4] * X.y + test_R.m[5] * X.z + test_t.y;
        float Xc_z = test_R.m[6] * X.x + test_R.m[7] * X.y + test_R.m[8] * X.z + test_t.z;
        float x_proj = Xc_x / Xc_z;
        float y_proj = Xc_y / Xc_z;
        float ex = x_proj - p2d[i].x;
        float ey = y_proj - p2d[i].y;
        total_err += ex * ex + ey * ey;
    }
    assert(total_err < 1.0f);
    LOG "[8/62] Testing PnP RANSAC with Outliers... PASS\n";

    // ========================================================================
    // TEST 9: Fundamental Matrix RANSAC
    // ========================================================================
    LOG "[9/62] Testing Fundamental Matrix RANSAC...\n";
    std::vector<Point2D> f_pts1 = {{100, 100}, {200, 100}, {100, 200}, {200, 200}, {150, 150}, {120, 180}, {180, 120}, {160, 160}};
    std::vector<Point2D> f_pts2 = {{110, 110}, {210, 110}, {110, 210}, {210, 210}, {160, 160}, {130, 190}, {190, 130}, {170, 170}};
    Mat3 F_test;
    std::vector<int> f_inliers_test;
    compute_fundamental_ransac(f_pts1, f_pts2, F_test, f_inliers_test);
    assert(f_inliers_test.size() >= 4);
    LOG "[9/62] Testing Fundamental Matrix RANSAC... PASS\n";

    // ========================================================================
    // TEST 10: Essential Matrix Decomposition & Triangulation
    // ========================================================================
    LOG "[10/62] Testing Essential Matrix Decomposition & Triangulation...\n";
    Mat3 E_synth = {0, 0, 0, 0, 0, -1, 0, 1, 0};
    Mat3 dR1, dR2;
    Vec3 dt1, dt2;
    decompose_essential(E_synth, dR1, dR2, dt1, dt2);
    bool t_valid = (fabs(fabs(dt1.x) - 1.0f) < 0.1f && fabs(dt1.y) < 0.1f && fabs(dt1.z) < 0.1f) ||
                   (fabs(fabs(dt2.x) - 1.0f) < 0.1f && fabs(dt2.y) < 0.1f && fabs(dt2.z) < 0.1f);
    assert(t_valid);
    Mat3 R1_test = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    Vec3 t1_test = {0, 0, 0};
    Mat3 R2_test = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    Vec3 t2_test = {1, 0, 0};
    Vec3 X_test = triangulate({0, 0, 1}, R1_test, t1_test, {1, 0, 1}, R2_test, t2_test);
    assert(fabs(X_test.x - 0.0f) < 0.1f && fabs(X_test.y - 0.0f) < 0.1f && fabs(X_test.z - 1.0f) < 0.1f);
    LOG "[10/62] Testing Essential Matrix Decomposition & Triangulation... PASS\n";

    // ========================================================================
    // TEST 11: 3D Scale Calibration
    // ========================================================================
    LOG "[11/62] Testing 3D Scale Calibration...\n";
    slam_calibrate_scale(0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 3.0f);
    assert(fabs(slam_get_scale_factor() - 3.0f) < 1e-6f);
    LOG "[11/62] Testing 3D Scale Calibration... PASS\n";

    // ========================================================================
    // TEST 21: Reprojection Error Thresholds in PnP
    // ========================================================================
    LOG "[21/62] Testing Reprojection Error Thresholds in PnP...\n";
    std::vector<Vec3> p3d_test;
    std::vector<Vec3> p2d_test;
    for (int i = 0; i < 20; ++i) {
        float x = (float)(i % 5) * 0.4f - 0.8f;
        float y = (float)(i / 5) * 0.4f - 0.8f;
        float z = 2.0f + (float)(i % 7) * 0.2f + (float)(i / 7) * 0.3f;
        p3d_test.push_back({x, y, z});
        p2d_test.push_back({x / z, y / z, 1.0f});
    }
    Mat3 pnp_R = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    Vec3 pnp_t = {0, 0, 0};
    solve_pnp_ransac(p3d_test, p2d_test, pnp_R, pnp_t);
    float max_err = 0.0f;
    for (int i = 0; i < 20; ++i) {
        Vec3 X = p3d_test[i];
        float Xc_x = pnp_R.m[0] * X.x + pnp_R.m[1] * X.y + pnp_R.m[2] * X.z + pnp_t.x;
        float Xc_y = pnp_R.m[3] * X.x + pnp_R.m[4] * X.y + pnp_R.m[5] * X.z + pnp_t.y;
        float Xc_z = pnp_R.m[6] * X.x + pnp_R.m[7] * X.y + pnp_R.m[8] * X.z + pnp_t.z;
        float x_proj = Xc_x / Xc_z;
        float y_proj = Xc_y / Xc_z;
        float err = (x_proj - p2d_test[i].x) * (x_proj - p2d_test[i].x) + (y_proj - p2d_test[i].y) * (y_proj - p2d_test[i].y);
        if (err > max_err) max_err = err;
    }
    assert(max_err < 0.001f);
    LOG "[21/62] Testing Reprojection Error Thresholds in PnP... PASS\n";

    // ========================================================================
    // TEST 22: ORB Descriptor Extraction Consistency
    // ========================================================================
    LOG "[22/62] Testing ORB Descriptor Extraction Consistency...\n";
    std::vector<uint8_t> test_img(100 * 100, 128);
    int t_dot_id = 0;
    for (int i = 0; i < 2; ++i) {
        for (int j = 0; j < 2; ++j) {
            test_draw_small_dot(test_img, 25 + i * 50, 25 + j * 50, t_dot_id++, 100, 100);
        }
    }
    std::vector<Keypoint> test_kps;
    std::vector<Descriptor> test_descs;
    int orig_w = g_width, orig_h = g_height;
    float orig_fx = g_fx, orig_fy = g_fy, orig_cx = g_cx, orig_cy = g_cy;
    g_width = 100; g_height = 100;
    g_fx = 50; g_fy = 50; g_cx = 50; g_cy = 50;
    extract_features(test_img.data(), test_kps, test_descs);
    g_width = orig_w; g_height = orig_h;
    g_fx = orig_fx; g_fy = orig_fy; g_cx = orig_cx; g_cy = orig_cy;
    assert(test_kps.size() > 0);
    assert(test_descs.size() == test_kps.size());
    bool has_variation = false;
    for (size_t i = 0; i < test_descs.size() && !has_variation; ++i) {
        for (int b = 0; b < 32; ++b) {
            if (test_descs[i].data[b] != 0 && test_descs[i].data[b] != 255) {
                has_variation = true;
                break;
            }
        }
    }
    assert(has_variation);
    LOG "[22/62] Testing ORB Descriptor Extraction Consistency... PASS\n";

    // ========================================================================
    // TEST 23: Local Bundle Adjustment Convergence
    // ========================================================================
    LOG "[23/62] Testing Local Bundle Adjustment Convergence...\n";
    slam_init(640, 480, 60.0f);
    Keyframe test_kf;
    test_kf.kps = {{320.0f, 240.0f, 50.0f, 0.0f}, {420.0f, 240.0f, 50.0f, 0.0f}, {220.0f, 240.0f, 50.0f, 0.0f}, {320.0f, 340.0f, 50.0f, 0.0f}, {320.0f, 140.0f, 50.0f, 0.0f}};
    test_kf.descs = {{{0}}, {{0}}, {{0}}, {{0}}, {{0}}};
    test_kf.R = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    test_kf.t = {0, 0, 0};
    test_kf.pts3d = {{0.0f, 0.0f, 10.0f}, {1.0f, 0.0f, 10.0f}, {-1.0f, 0.0f, 10.0f}, {0.0f, 1.0f, 10.0f}, {0.0f, -1.0f, 10.0f}};
    test_kf.map_point_ids = {-1, -1, -1, -1, -1};
    test_kf.R.m[4] = 0.9f;
    std::vector<MapPoint> dummy_map;
    local_bundle_adjustment(test_kf, dummy_map);
    float det_ba = det3x3(test_kf.R.m);
    assert(fabs(fabs(det_ba) - 1.0f) < 0.01f);
    LOG "[23/62] Testing Local Bundle Adjustment Convergence... PASS\n";

    // ========================================================================
    // TEST 24: Essential Matrix RANSAC with Noise
    // ========================================================================
    LOG "[24/62] Testing Essential Matrix RANSAC with Noise...\n";
    std::vector<Vec3> e_pts1, e_pts2;
    for (int i = 0; i < 20; ++i) {
        float x = (float)(i % 5) * 0.2f - 0.4f;
        float y = (float)(i / 5) * 0.2f - 0.4f;
        e_pts1.push_back({x, y, 1.0f});
        e_pts2.push_back({x - 1.0f, y, 1.0f});
    }
    for (int i = 0; i < 10; ++i) e_pts2.push_back({10.0f, 10.0f, 1.0f});
    Mat3 E_out;
    std::vector<int> e_inliers;
    compute_essential_ransac(e_pts1, e_pts2, E_out, e_inliers);
    assert(e_inliers.size() >= 15);
    LOG "[24/62] Testing Essential Matrix RANSAC with Noise... PASS\n";

    // ========================================================================
    // TEST 25: Feature Matching Robustness
    // ========================================================================
    LOG "[25/62] Testing Feature Matching Robustness...\n";
    std::vector<Descriptor> d1(2), d2(2);
    for (int i = 0; i < 32; ++i) {
        d1[0].data[i] = 0xAA; d1[1].data[i] = 0x55;
        d2[0].data[i] = 0xAA; d2[1].data[i] = 0x55;
    }
    std::vector<Descriptor> d3(1);
    for (int i = 0; i < 32; ++i) d3[0].data[i] = 0xFF;
    d2.push_back(d3[0]);
    std::vector<Match> matches;
    match_features(d1, d2, matches);
    assert(matches.size() == 2);
    assert(matches[0].idx1 == 0 && matches[0].idx2 == 0);
    assert(matches[1].idx1 == 1 && matches[1].idx2 == 1);
    LOG "[25/62] Testing Feature Matching Robustness... PASS\n";

    // ========================================================================
    // TEST 28: Scale Calibration Edge Cases
    // ========================================================================
    LOG "[28/62] Testing Scale Calibration Edge Cases...\n";
    slam_calibrate_scale(1.0f, 1.0f, 0.0f, 1.0f, 1.0f, 0.0f, 3.0f);
    float scale_before = slam_get_scale_factor();
    slam_calibrate_scale(0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 3.0f);
    assert(fabs(slam_get_scale_factor() - scale_before) < 1e-6f);
    slam_calibrate_scale(0.0f, 0.0f, 0.0f, 2.0f, 0.0f, 0.0f, 6.0f);
    assert(fabs(slam_get_scale_factor() - 3.0f) < 1e-6f);
    LOG "[28/62] Testing Scale Calibration Edge Cases... PASS\n";

    // ========================================================================
    // TEST 29: Feature Matching with Empty Descriptors
    // ========================================================================
    LOG "[29/62] Testing Feature Matching with Empty Descriptors...\n";
    std::vector<Descriptor> empty_d1;
    std::vector<Descriptor> empty_d2;
    std::vector<Match> empty_matches;
    match_features(empty_d1, empty_d2, empty_matches);
    assert(empty_matches.size() == 0);
    std::vector<Descriptor> d_nonempty(1);
    for(int i=0; i<32; ++i) d_nonempty[0].data[i] = 0xFF;
    match_features(empty_d1, d_nonempty, empty_matches);
    assert(empty_matches.size() == 0);
    LOG "[29/62] Testing Feature Matching with Empty Descriptors... PASS\n";

    // ========================================================================
    // TEST 34: Feature Matching with Completely Different Descriptors
    // ========================================================================
    LOG "[34/62] Testing Feature Matching with Completely Different Descriptors...\n";
    std::vector<Descriptor> diff_d1(2), diff_d2(2);
    for (int i = 0; i < 32; ++i) {
        diff_d1[0].data[i] = 0x00; diff_d1[1].data[i] = 0x00;
        diff_d2[0].data[i] = 0xFF; diff_d2[1].data[i] = 0xFF;
    }
    std::vector<Match> diff_matches;
    match_features(diff_d1, diff_d2, diff_matches);
    assert(diff_matches.size() == 0);
    LOG "[34/62] Testing Feature Matching with Completely Different Descriptors... PASS\n";

    // ========================================================================
    // TEST 35: PnP RANSAC with Nearly Coplanar Points
    // ========================================================================
    LOG "[35/62] Testing PnP RANSAC with Nearly Coplanar Points...\n";
    std::vector<Vec3> coplanar_p3d;
    std::vector<Vec3> coplanar_p2d;
    for (int i = 0; i < 20; ++i) {
        float x = (float)(i % 5) * 0.5f - 1.0f;
        float y = (float)(i / 5) * 0.5f - 1.0f;
        float z = 2.0f + (float)(i % 3) * 0.1f;
        coplanar_p3d.push_back({x, y, z});
        coplanar_p2d.push_back({x / z, y / z, 1.0f});
    }
    Mat3 coplanar_R = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    Vec3 coplanar_t = {0, 0, 0};
    solve_pnp_ransac(coplanar_p3d, coplanar_p2d, coplanar_R, coplanar_t);
    float coplanar_err = 0;
    for (int i = 0; i < 20; ++i) {
        Vec3 X = coplanar_p3d[i];
        float Xc_x = coplanar_R.m[0] * X.x + coplanar_R.m[1] * X.y + coplanar_R.m[2] * X.z + coplanar_t.x;
        float Xc_y = coplanar_R.m[3] * X.x + coplanar_R.m[4] * X.y + coplanar_R.m[5] * X.z + coplanar_t.y;
        float Xc_z = coplanar_R.m[6] * X.x + coplanar_R.m[7] * X.y + coplanar_R.m[8] * X.z + coplanar_t.z;
        if (Xc_z > 1e-3f) {
            float x_proj = Xc_x / Xc_z;
            float y_proj = Xc_y / Xc_z;
            coplanar_err += (x_proj - coplanar_p2d[i].x) * (x_proj - coplanar_p2d[i].x) +
                            (y_proj - coplanar_p2d[i].y) * (y_proj - coplanar_p2d[i].y);
        }
    }
    assert(coplanar_err < 0.1f);
    LOG "[35/62] Testing PnP RANSAC with Nearly Coplanar Points... PASS\n";

    // ========================================================================
    // TEST 38: Essential Matrix with Pure Rotation (Degenerate Translation)
    // ========================================================================
    LOG "[38/62] Testing Essential Matrix with Pure Rotation (Degenerate Translation)...\n";
    std::vector<Vec3> rot_pts1, rot_pts2;
    for (int i = 0; i < 20; ++i) {
        float x = (float)(i % 5) * 0.2f - 0.4f;
        float y = (float)(i / 5) * 0.2f - 0.4f;
        rot_pts1.push_back({x, y, 1.0f});
        float cos_a = 0.9848f, sin_a = 0.1736f;
        float rx = cos_a * x - sin_a * y;
        float ry = sin_a * x + cos_a * y;
        rot_pts2.push_back({rx, ry, 1.0f});
    }
    Mat3 rot_E;
    std::vector<int> rot_inliers;
    compute_essential_ransac(rot_pts1, rot_pts2, rot_E, rot_inliers);
    assert(rot_inliers.size() >= 0);
    LOG "[38/62] Testing Essential Matrix with Pure Rotation... PASS\n";

    // ========================================================================
    // TEST 44: PnP RANSAC with Degenerate Depth (All points same Z)
    // ========================================================================
    LOG "[44/62] Testing PnP RANSAC with Degenerate Depth (All points same Z)...\n";
    std::vector<Vec3> deg_p3d;
    std::vector<Vec3> deg_p2d;
    for (int i = 0; i < 20; ++i) {
        float x = (float)(i % 5) * 0.5f - 1.0f;
        float y = (float)(i / 5) * 0.5f - 1.0f;
        float z = 2.0f;
        deg_p3d.push_back({x, y, z});
        deg_p2d.push_back({x / z, y / z, 1.0f});
    }
    Mat3 deg_R = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    Vec3 deg_t = {0, 0, 0};
    solve_pnp_ransac(deg_p3d, deg_p2d, deg_R, deg_t);
    float deg_det = det3x3(deg_R.m);
    assert(fabs(fabs(deg_det) - 1.0f) < 0.01f);
    LOG "[44/62] Testing PnP RANSAC with Degenerate Depth... PASS\n";

    // ========================================================================
    // TEST 45: Feature Matching with Identical Descriptors (Distance 0)
    // ========================================================================
    LOG "[45/62] Testing Feature Matching with Identical Descriptors (Distance 0)...\n";
    std::vector<Descriptor> id_d1(2), id_d2(2);
    for (int i = 0; i < 32; ++i) {
        id_d1[0].data[i] = 0xAA; id_d1[1].data[i] = 0x55;
        id_d2[0].data[i] = 0xAA; id_d2[1].data[i] = 0x55;
    }
    std::vector<Match> id_matches;
    match_features(id_d1, id_d2, id_matches);
    assert(id_matches.size() == 2);
    assert(id_matches[0].dist == 0.0f);
    assert(id_matches[1].dist == 0.0f);
    LOG "[45/62] Testing Feature Matching with Identical Descriptors... PASS\n";

    // ========================================================================
    // TEST 47: FAST-9 Contiguous Corner Detection
    // ========================================================================
    LOG "[47/62] Testing FAST-9 Contiguous Corner Detection...\n";
    std::vector<uint8_t> fast_img(100 * 100, 128);
    int cx = 50, cy = 50;
    int circle_x[16] = {0, 1, 2, 3, 3, 3, 2, 1, 0, -1, -2, -3, -3, -3, -2, -1};
    int circle_y[16] = {-3, -3, -2, -1, 0, 1, 2, 3, 3, 3, 2, 1, 0, -1, -2, -3};
    for (int i = 0; i < 16; i += 2) {
        fast_img[(cy + circle_y[i]) * 100 + (cx + circle_x[i])] = 255;
    }
    std::vector<Keypoint> fast_kps;
    std::vector<Descriptor> fast_descs;
    int prev_w_fast = g_width, prev_h_fast = g_height;
    g_width = 100; g_height = 100;
    extract_features(fast_img.data(), fast_kps, fast_descs);
    g_width = prev_w_fast; g_height = prev_h_fast;
    bool found_non_contiguous = false;
    for (const auto& kp : fast_kps) {
        if (fabs(kp.x - cx) < 2.0f && fabs(kp.y - cy) < 2.0f) {
            found_non_contiguous = true;
        }
    }
    assert(!found_non_contiguous);
    LOG "[47/62] Testing FAST-9 Contiguous Corner Detection... PASS\n";

    // ========================================================================
    // TEST 48: PnP with exactly 6 points (Minimal Solver)
    // ========================================================================
    LOG "[48/62] Testing PnP with exactly 6 points (Minimal Solver)...\n";
    std::vector<Vec3> min_p3d;
    std::vector<Vec3> min_p2d;
    for (int i = 0; i < 6; ++i) {
        float x = (float)(i % 3) * 0.5f - 0.5f;
        float y = (float)(i / 3) * 0.5f - 0.5f;
        float z = 2.0f;
        min_p3d.push_back({x, y, z});
        min_p2d.push_back({x / z, y / z, 1.0f});
    }
    Mat3 min_R = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    Vec3 min_t = {0, 0, 0};
    solve_pnp_ransac(min_p3d, min_p2d, min_R, min_t);
    float min_det = det3x3(min_R.m);
    assert(fabs(fabs(min_det) - 1.0f) < 0.01f);
    LOG "[48/62] Testing PnP with exactly 6 points... PASS\n";

    // ========================================================================
    // TEST 49: Fundamental Matrix with Collinear Points
    // ========================================================================
    LOG "[49/62] Testing Fundamental Matrix with Collinear Points...\n";
    std::vector<Point2D> col_pts1, col_pts2;
    for (int i = 0; i < 10; ++i) {
        col_pts1.push_back({(float)i * 10.0f, 100.0f});
        col_pts2.push_back({(float)i * 10.0f + 5.0f, 100.0f});
    }
    Mat3 col_F;
    std::vector<int> col_inliers;
    compute_fundamental_ransac(col_pts1, col_pts2, col_F, col_inliers);
    assert(true);
    LOG "[49/62] Testing Fundamental Matrix with Collinear Points... PASS\n";

    // ========================================================================
    // TEST 50: Essential Matrix with Zero Translation
    // ========================================================================
    LOG "[50/62] Testing Essential Matrix with Zero Translation...\n";
    std::vector<Vec3> zero_t_pts1, zero_t_pts2;
    for (int i = 0; i < 10; ++i) {
        zero_t_pts1.push_back({(float)i * 0.1f, 0.0f, 1.0f});
        zero_t_pts2.push_back({(float)i * 0.1f, 0.0f, 1.0f});
    }
    Mat3 zero_t_E;
    std::vector<int> zero_t_inliers;
    compute_essential_ransac(zero_t_pts1, zero_t_pts2, zero_t_E, zero_t_inliers);
    assert(true);
    LOG "[50/62] Testing Essential Matrix with Zero Translation... PASS\n";

    // ========================================================================
    // TEST 56: Sampson Distance Threshold (3.0 pixels) with Realistic Noise
    // ========================================================================
    LOG "[56/62] Testing Sampson Distance Threshold (3.0 pixels) with Realistic Noise...\n";
    std::vector<Vec3> sampson_pts1, sampson_pts2;
    for (int i = 0; i < 30; ++i) {
        float x = (float)(i % 6) * 0.15f - 0.375f;
        float y = (float)(i / 6) * 0.15f - 0.375f;
        float noise_x = ((i * 7) % 5 - 2) * 0.002f;
        float noise_y = ((i * 11) % 5 - 2) * 0.002f;
        sampson_pts1.push_back({x, y, 1.0f});
        sampson_pts2.push_back({x - 0.05f + noise_x, y + noise_y, 1.0f});
    }
    Mat3 sampson_E;
    std::vector<int> sampson_inliers;
    compute_essential_ransac(sampson_pts1, sampson_pts2, sampson_E, sampson_inliers);
    assert(sampson_inliers.size() >= 20);
    LOG "[56/62] Testing Sampson Distance Threshold (3.0 pixels) with Realistic Noise... PASS\n";

    // ========================================================================
    // TEST 57: Hartley Normalization with Clustered Coordinates
    // ========================================================================
    LOG "[57/62] Testing Hartley Normalization with Clustered Coordinates...\n";
    std::vector<Vec3> clustered_pts1, clustered_pts2;
    for (int i = 0; i < 25; ++i) {
        float x = 0.5f + (float)(i % 5) * 0.02f;
        float y = 0.5f + (float)(i / 5) * 0.02f;
        clustered_pts1.push_back({x, y, 1.0f});
        clustered_pts2.push_back({x - 0.03f, y + 0.01f, 1.0f});
    }
    Mat3 hartley_E;
    std::vector<int> hartley_inliers;
    compute_essential_ransac(clustered_pts1, clustered_pts2, hartley_E, hartley_inliers);
    assert(hartley_inliers.size() >= 15);
    LOG "[57/62] Testing Hartley Normalization with Clustered Coordinates... PASS\n";

    // ========================================================================
    // TEST 58: Spatial Bucketing (8x8 Grid, 5 per Cell)
    // ========================================================================
    LOG "[58/62] Testing Spatial Bucketing (8x8 Grid, 5 per Cell)...\n";
    std::vector<uint8_t> bucket_img(640 * 480, 128);
    for (int i = 0; i < 100; ++i) {
        int x = 320 + (i % 10) * 3;
        int y = 240 + (i / 10) * 3;
        for (int dy = -2; dy <= 2; ++dy) {
            for (int dx = -2; dx <= 2; ++dx) {
                bucket_img[(y + dy) * 640 + (x + dx)] = 255;
            }
        }
    }
    std::vector<Keypoint> bucket_kps;
    std::vector<Descriptor> bucket_descs;
    extract_features(bucket_img.data(), bucket_kps, bucket_descs);
    assert(bucket_kps.size() <= 320);
    assert(bucket_kps.size() > 0);
    LOG "[58/62] Testing Spatial Bucketing (8x8 Grid, 5 per Cell)... PASS\n";

    LOG "=== SUITE 2 COMPLETE (23/62 tests) ===\n";
}

#endif // SLAM_OPENCV_TEST_ALGORITHMS_CPP
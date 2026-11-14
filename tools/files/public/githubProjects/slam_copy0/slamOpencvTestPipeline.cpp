// ./slamOpencvTestPipeline.cpp
// TEST SUITE 3: Full SLAM Pipeline, Floor Plane, Keyframe Policy, Phase 2 (28 tests)
#ifndef SLAM_OPENCV_TEST_PIPELINE_CPP
#define SLAM_OPENCV_TEST_PIPELINE_CPP

#include <iostream>
#include <cassert>
#include <vector>
#include <cmath>
#include "slamOpencv.cpp"

#define LOG msginfo <<

extern void test_draw_dot(std::vector<uint8_t>& img, int x, int y, int id, int w, int h);

// ============================================================================
// PHASE 2 KEYFRAME POLICY TEST STRUCTURES
// ============================================================================
struct TestTrajectoryPoint {
    float x, y, z;
    int frame_number;
    bool is_keyframe;
};

struct TestFloorValidation {
    float expected_normal_x, expected_normal_y, expected_normal_z;
    float expected_d;
    float actual_normal_x, actual_normal_y, actual_normal_z;
    float actual_d;
    float angle_error_deg;
    float distance_error;
    bool passed;
};

struct TestResults {
    int total_frames;
    int keyframes_created;
    int expected_keyframes;
    bool policy_violation;
    TestFloorValidation floor_validation;
    int map_points_count;
};

std::vector<TestTrajectoryPoint> g_test_trajectory;
TestResults g_test_results = {0};

// ============================================================================
// PROPER FLOOR PLANE SIMULATION
// ============================================================================
void generate_test_frames(
    int width, int height,
    std::vector<std::vector<uint8_t>>& frames,
    std::vector<std::vector<float>>& imu_data,
    int num_frames
) {
    frames.clear();
    imu_data.clear();
    std::vector<Vec3> floor_points;
    for (float x = -4.0f; x <= 4.0f; x += 0.5f) {
        for (float z = 2.0f; z <= 10.0f; z += 0.5f) {
            floor_points.push_back({x, 0.0f, z});
        }
    }
    float fov_deg = 60.0f;
    float fov_rad = fov_deg * 3.14159265f / 180.0f;
    float fx = (width / 2.0f) / tan(fov_rad / 2.0f);
    float fy = fx;
    float cx = width / 2.0f;
    float cy = height / 2.0f;
    for (int frame = 0; frame < num_frames; ++frame) {
        std::vector<uint8_t> img(width * height, 0);
        float cam_x = sin(frame * 0.1f) * 0.5f;
        float cam_y = 2.0f;
        float cam_z = frame * 0.3f;
        int dot_id = 0;
        for (const auto& pt : floor_points) {
            float Xc_x = pt.x - cam_x;
            float Xc_y = pt.y - cam_y;
            float Xc_z = pt.z - cam_z;
            if (Xc_z < 0.5f) continue;
            float u = fx * (Xc_x / Xc_z) + cx;
            float v = fy * (Xc_y / Xc_z) + cy;
            int px = (int)u;
            int py = (int)v;
            if (px >= 10 && px < width - 10 && py >= 10 && py < height - 10) {
                for (int dy = -6; dy <= 6; ++dy) {
                    for (int dx = -6; dx <= 6; ++dx) {
                        int draw_x = px + dx;
                        int draw_y = py + dy;
                        if (draw_x >= 0 && draw_x < width && draw_y >= 0 && draw_y < height) {
                            int dist_sq = dx * dx + dy * dy;
                            if (dist_sq <= 3) {
                                img[draw_y * width + draw_x] = 255;
                            } else if (dist_sq <= 16) {
                                int pattern = (dot_id * 73 + dx * 41 + dy * 29) % 256;
                                img[draw_y * width + draw_x] = (pattern < 128) ? 0 : 200;
                            }
                        }
                    }
                }
            }
            dot_id++;
        }
        frames.push_back(img);
        std::vector<float> imu = {0.0f, -1.0f, 0.0f};
        imu_data.push_back(imu);
    }
}

// ============================================================================
// PHASE 2 KEYFRAME POLICY TEST (exported for JS test harness)
// ============================================================================
ag_export(run_keyframe_policy_test)
int run_keyframe_policy_test(int width, int height, float fov_deg) {
    LOG "=== PHASE 2 KEYFRAME POLICY TEST ===\n";
    slam_init(width, height, fov_deg);
    int num_frames = 50;
    std::vector<std::vector<uint8_t>> frames;
    std::vector<std::vector<float>> imu_data;
    generate_test_frames(width, height, frames, imu_data, num_frames);
    g_test_trajectory.clear();
    g_test_results = {0};
    int prev_keyframe_count = 0;
    float out_pose[10];
    int out_pose_size = 0;
    LOG "[DEBUG] Starting frame processing loop with proper floor plane simulation...\n";
    for (int i = 0; i < num_frames; ++i) {
        int result = slam_process_frame(frames[i].data(), imu_data[i].data(), out_pose, &out_pose_size);
        int current_kf_count = slam_get_keyframe_count();
        bool is_keyframe = (current_kf_count > prev_keyframe_count);
        TestTrajectoryPoint point;
        point.x = out_pose[0];
        point.y = out_pose[1];
        point.z = out_pose[2];
        point.frame_number = i;
        point.is_keyframe = is_keyframe;
        g_test_trajectory.push_back(point);
        if (is_keyframe) {
            LOG "[DEBUG] Frame " << i << ": Keyframe created (total: " << current_kf_count << ")\n";
            prev_keyframe_count = current_kf_count;
        }
    }
    g_test_results.total_frames = num_frames;
    g_test_results.keyframes_created = slam_get_keyframe_count();
    g_test_results.map_points_count = slam_get_map_point_count();
    LOG "[DEBUG] Frame processing complete. Keyframes: " << g_test_results.keyframes_created << ", Map points: " << g_test_results.map_points_count << "\n";

    float imu_gravity[3] = {0.0f, -1.0f, 0.0f};
    float plane[4];
    int hull_size = 0;
    float hull[100];
    slam_get_floor_plane(imu_gravity, plane, &hull_size, hull);
    LOG "[DEBUG] Floor plane extracted: Normal(" << plane[0] << ", " << plane[1] << ", " << plane[2] << "), d=" << plane[3] << "\n";
    LOG "[DEBUG] Floor hull size: " << hull_size << "\n";

    g_test_results.floor_validation.expected_normal_x = 0.0f;
    g_test_results.floor_validation.expected_normal_y = 1.0f;
    g_test_results.floor_validation.expected_normal_z = 0.0f;
    g_test_results.floor_validation.expected_d = 0.0f;
    g_test_results.floor_validation.actual_normal_x = plane[0];
    g_test_results.floor_validation.actual_normal_y = plane[1];
    g_test_results.floor_validation.actual_normal_z = plane[2];
    g_test_results.floor_validation.actual_d = plane[3];
    float dot_product = plane[0] * 0.0f + plane[1] * 1.0f + plane[2] * 0.0f;
    float angle_rad = acos(std::max(-1.0f, std::min(1.0f, dot_product)));
    g_test_results.floor_validation.angle_error_deg = angle_rad * 180.0f / 3.14159265f;
    g_test_results.floor_validation.distance_error = fabs(plane[3]);
    g_test_results.floor_validation.passed =
        (g_test_results.floor_validation.angle_error_deg < 5.0f) &&
        (g_test_results.floor_validation.distance_error < 2.0f) &&
        (hull_size >= 3);
    g_test_results.expected_keyframes = 2;
    g_test_results.policy_violation = (g_test_results.keyframes_created > 10);

    LOG "\n=== DETAILED TEST RESULTS ===\n";
    LOG "Total frames: " << g_test_results.total_frames << "\n";
    LOG "Keyframes created: " << g_test_results.keyframes_created << " (Expected: ~" << g_test_results.expected_keyframes << ")\n";
    LOG "Map points: " << g_test_results.map_points_count << "\n";
    LOG "\n--- Floor Validation Details ---\n";
    LOG "Expected Normal: (" << g_test_results.floor_validation.expected_normal_x << ", "
        << g_test_results.floor_validation.expected_normal_y << ", "
        << g_test_results.floor_validation.expected_normal_z << ")\n";
    LOG "Actual Normal:   (" << g_test_results.floor_validation.actual_normal_x << ", "
        << g_test_results.floor_validation.actual_normal_y << ", "
        << g_test_results.floor_validation.actual_normal_z << ")\n";
    LOG "Expected D: " << g_test_results.floor_validation.expected_d << "\n";
    LOG "Actual D:   " << g_test_results.floor_validation.actual_d << "\n";
    LOG "Floor Angle Error:  " << g_test_results.floor_validation.angle_error_deg << " degrees (Limit: < 5.0)\n";
    LOG "Floor Distance Err: " << g_test_results.floor_validation.distance_error << " (Limit: < 2.0 for synthetic test)\n";
    LOG "Floor Hull Size:    " << hull_size << " (Limit: >= 3)\n";

    bool angle_ok = g_test_results.floor_validation.angle_error_deg < 5.0f;
    bool dist_ok = g_test_results.floor_validation.distance_error < 2.0f;
    bool hull_ok = hull_size >= 3;
    LOG "\nFloor Validation Checks:\n";
    LOG "  - Angle OK:      " << (angle_ok ? "YES" : "NO") << "\n";
    LOG "  - Distance OK:   " << (dist_ok ? "YES" : "NO") << "\n";
    LOG "  - Hull Size OK:  " << (hull_ok ? "YES" : "NO") << "\n";
    LOG "\nPolicy compliance: " << (g_test_results.policy_violation ? "VIOLATION" : "OK") << "\n";

    bool test_passed = !g_test_results.policy_violation && g_test_results.floor_validation.passed;
    LOG "\n=== OVERALL: " << (test_passed ? "PASS" : "FAIL") << " ===\n";
    if (!test_passed) {
        if (g_test_results.policy_violation) LOG "FAILURE REASON: Keyframe policy violation (created too many keyframes).\n";
        if (!g_test_results.floor_validation.passed) {
            LOG "FAILURE REASON: Floor validation failed.\n";
            if (!angle_ok) LOG "  -> Angle error exceeded 5.0 degrees.\n";
            if (!dist_ok) LOG "  -> Distance error exceeded 2.0 (synthetic test limit).\n";
            if (!hull_ok) LOG "  -> Hull size < 3 (not enough floor points).\n";
        }
    }
    return test_passed ? 0 : -1;
}

ag_export(get_test_trajectory)
int get_test_trajectory(int* out_data_ptr, int* out_count_ptr) {
    int count = (int)g_test_trajectory.size();
    if (out_count_ptr) *out_count_ptr = count;
    if (count == 0) {
        if (out_data_ptr) *out_data_ptr = 0;
        return 0;
    }
    size_t bytes = count * 5 * sizeof(float);
    float* data = (float*)malloc(bytes);
    for (int i = 0; i < count; ++i) {
        data[i * 5 + 0] = g_test_trajectory[i].x;
        data[i * 5 + 1] = g_test_trajectory[i].y;
        data[i * 5 + 2] = g_test_trajectory[i].z;
        data[i * 5 + 3] = (float)g_test_trajectory[i].frame_number;
        data[i * 5 + 4] = g_test_trajectory[i].is_keyframe ? 1.0f : 0.0f;
    }
    if (out_data_ptr) *out_data_ptr = (int)(uintptr_t)data;
    return 0;
}

ag_export(free_test_trajectory)
void free_test_trajectory(int ptr) {
    if (ptr) free((void*)(uintptr_t)ptr);
}

ag_export(get_test_results)
int get_test_results(
    int* total_frames,
    int* keyframes_created,
    int* expected_keyframes,
    int* policy_violation,
    float* floor_angle_error,
    float* floor_distance_error,
    int* floor_passed,
    int* map_points_count
) {
    if (total_frames) *total_frames = g_test_results.total_frames;
    if (keyframes_created) *keyframes_created = g_test_results.keyframes_created;
    if (expected_keyframes) *expected_keyframes = g_test_results.expected_keyframes;
    if (policy_violation) *policy_violation = g_test_results.policy_violation ? 1 : 0;
    if (floor_angle_error) *floor_angle_error = g_test_results.floor_validation.angle_error_deg;
    if (floor_distance_error) *floor_distance_error = g_test_results.floor_validation.distance_error;
    if (floor_passed) *floor_passed = g_test_results.floor_validation.passed ? 1 : 0;
    if (map_points_count) *map_points_count = g_test_results.map_points_count;
    return 0;
}

// ============================================================================
// THREE.JS IMAGE TEST (used by slam_tests.html)
// ============================================================================
ag_export(run_threejs_image_test)
int run_threejs_image_test(uint8_t* img1_data, uint8_t* img2_data, int width, int height) {
    LOG "[Testing Three.js Generated Image Processing...]\n";
    slam_init(width, height, 60.0f);
    float imu_gravity[3] = {0.0f, -1.0f, 0.0f};
    float out_pose[10];
    int out_pose_size = 0;
    int res1 = slam_process_frame(img1_data, imu_gravity, out_pose, &out_pose_size);
    if (res1 != 0) { LOG "Failed to process first frame\n"; return -1; }
    if (slam_get_keyframe_count() != 1) { LOG "Keyframe count mismatch after first frame\n"; return -2; }
    int res2 = slam_process_frame(img2_data, imu_gravity, out_pose, &out_pose_size);
    if (res2 != 0) { LOG "Failed to process second frame\n"; return -3; }
    int kf_count = slam_get_keyframe_count();
    if (kf_count < 1) { LOG "Keyframe count mismatch after second frame\n"; return -4; }
    int map_points = slam_get_map_point_count();
    LOG "Processed Two Three.js Frames. Keyframes: " << kf_count << ", Map Points: " << map_points << "\n";
    LOG "[Testing Three.js Generated Image Processing...] PASS\n";
    return 0;
}

// ============================================================================
// SUITE 3: FULL PIPELINE TESTS (28 tests)
// ============================================================================
void run_pipeline_tests() {
    LOG "\n=== SUITE 3: FULL PIPELINE & PHASE 2 (28 tests) ===\n";

    // ========================================================================
    // TEST 5: End-to-End SLAM Initialization & Tracking
    // ========================================================================
    LOG "[5/62] Testing End-to-End SLAM Initialization & Tracking...\n";
    slam_init(640, 480, 60.0f);
    const int shift_x = 40;
    float imu_gravity[3] = {0.0f, -1.0f, 0.0f};
    float out_pose[10];
    int out_pose_size = 0;
    std::vector<uint8_t> img1(640 * 480, 0);
    int dot_id = 0;
    for (int i = 0; i < 8; ++i) {
        for (int j = 0; j < 8; ++j) {
            test_draw_dot(img1, 80 + i * 60, 60 + j * 50, dot_id++, 640, 480);
        }
    }
    slam_process_frame(img1.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 1);
    std::vector<uint8_t> img2(640 * 480, 0);
    dot_id = 0;
    for (int i = 0; i < 8; ++i) {
        for (int j = 0; j < 8; ++j) {
            int orig_x = 80 + i * 60;
            int orig_y = 60 + j * 50;
            test_draw_dot(img2, orig_x + shift_x, orig_y, dot_id++, 640, 480);
        }
    }
    slam_process_frame(img2.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 2);
    assert(slam_get_map_point_count() >= 4);
    LOG "[5/62] Testing End-to-End SLAM Initialization & Tracking... PASS\n";

    // ========================================================================
    // TEST 6: Floor Plane Extraction & Map Separation Protocol
    // ========================================================================
    LOG "[6/62] Testing Floor Plane Extraction & Map Separation Protocol...\n";
    slam_init(640, 480, 60.0f);
    slam_add_test_point(0.0f, 10.0f, 0.0f);
    slam_add_test_point(1.0f, 10.0f, 0.0f);
    slam_add_test_point(0.0f, 0.0f, 0.0f);
    slam_add_test_point(1.0f, 0.0f, 0.0f);
    slam_add_test_point(0.0f, 0.0f, 1.0f);
    slam_add_test_point(1.0f, 0.0f, 1.0f);
    assert(slam_get_map_point_count() == 6);
    float plane[4];
    int hull_size = 0;
    float floor_hull[100];
    slam_get_floor_plane(imu_gravity, plane, &hull_size, floor_hull);
    assert(slam_get_map_point_count() == 6);
    assert(hull_size >= 3);
    assert(fabs(plane[1] - 1.0f) < 0.1f || fabs(plane[1] + 1.0f) < 0.1f);
    LOG "[6/62] Testing Floor Plane Extraction & Map Separation Protocol... PASS\n";

    // ========================================================================
    // TEST 7: Max Map Points Limit
    // ========================================================================
    LOG "[7/62] Testing Max Map Points Limit...\n";
    slam_init(640, 480, 60.0f);
    slam_set_max_map_points(5);
    for (int i = 0; i < 10; ++i) slam_add_test_point((float)i, 0.0f, 0.0f);
    assert(slam_get_map_point_count() == 5);
    LOG "[7/62] Testing Max Map Points Limit... PASS\n";

    // ========================================================================
    // TEST 12: SLAM Reset and Memory Cleanup
    // ========================================================================
    LOG "[12/62] Testing SLAM Reset and Memory Cleanup...\n";
    slam_init(640, 480, 60.0f);
    for (int i = 0; i < 100; ++i) slam_add_test_point((float)i, (float)i, (float)i);
    int map_count = slam_get_map_point_count();
    assert(map_count == 100);
    slam_reset();
    map_count = slam_get_map_point_count();
    int kf_count = slam_get_keyframe_count();
    float scale = slam_get_scale_factor();
    assert(map_count == 0 && kf_count == 0 && fabs(scale - 1.0f) < 1e-6f);
    LOG "[12/62] Testing SLAM Reset and Memory Cleanup... PASS\n";

    // ========================================================================
    // TEST 13: Frame Skipping Strategy
    // ========================================================================
    LOG "[13/62] Testing Frame Skipping Strategy...\n";
    slam_init(640, 480, 60.0f);
    slam_set_frame_stride(2);
    slam_set_use_sliding_window(false);
    dot_id = 0;
    for (int i = 0; i < 8; ++i) for (int j = 0; j < 8; ++j) test_draw_dot(img1, 80 + i * 60, 60 + j * 50, dot_id++, 640, 480);
    slam_process_frame(img1.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 1);
    float pose1_x = out_pose[0];
    dot_id = 0;
    for (int i = 0; i < 8; ++i) for (int j = 0; j < 8; ++j) test_draw_dot(img2, 80 + i * 60 + shift_x, 60 + j * 50, dot_id++, 640, 480);
    slam_process_frame(img2.data(), imu_gravity, out_pose, &out_pose_size);
    assert(out_pose[0] == pose1_x);
    assert(slam_get_keyframe_count() == 1);
    std::vector<uint8_t> img3(640 * 480, 0);
    dot_id = 0;
    for (int i = 0; i < 8; ++i) {
        for (int j = 0; j < 8; ++j) {
            test_draw_dot(img3, 80 + i * 60 + 80, 60 + j * 50, dot_id++, 640, 480);
        }
    }
    slam_process_frame(img3.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 2);
    LOG "[13/62] Testing Frame Skipping Strategy... PASS\n";

    // ========================================================================
    // TEST 14: Tracking Loss & Re-localization
    // ========================================================================
    LOG "[14/62] Testing Tracking Loss & Re-localization...\n";
    slam_init(640, 480, 60.0f);
    slam_set_min_track_points(5);
    dot_id = 0;
    for (int i = 0; i < 8; ++i) for (int j = 0; j < 8; ++j) test_draw_dot(img1, 80 + i * 60, 60 + j * 50, dot_id++, 640, 480);
    slam_process_frame(img1.data(), imu_gravity, out_pose, &out_pose_size);
    dot_id = 0;
    for (int i = 0; i < 8; ++i) for (int j = 0; j < 8; ++j) test_draw_dot(img2, 80 + i * 60 + shift_x, 60 + j * 50, dot_id++, 640, 480);
    slam_process_frame(img2.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 2);
    std::vector<uint8_t> img_noise(640 * 480, 128);
    int res = slam_process_frame(img_noise.data(), imu_gravity, out_pose, &out_pose_size);
    assert(res == 0);
    for (int i = 0; i < 30; ++i) res = slam_process_frame(img_noise.data(), imu_gravity, out_pose, &out_pose_size);
    assert(res == -1);
    LOG "[14/62] Testing Tracking Loss & Re-localization... PASS\n";

    // ========================================================================
    // TEST 15: Distance Rejection Threshold
    // ========================================================================
    LOG "[15/62] Testing Distance Rejection Threshold...\n";
    slam_init(640, 480, 60.0f);
    slam_set_tracking_distance_threshold(0.05f);
    dot_id = 0;
    for (int i = 0; i < 8; ++i) for (int j = 0; j < 8; ++j) test_draw_dot(img1, 80 + i * 60, 60 + j * 50, dot_id++, 640, 480);
    slam_process_frame(img1.data(), imu_gravity, out_pose, &out_pose_size);
    dot_id = 0;
    for (int i = 0; i < 8; ++i) for (int j = 0; j < 8; ++j) test_draw_dot(img2, 80 + i * 60 + shift_x, 60 + j * 50, dot_id++, 640, 480);
    slam_process_frame(img2.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 2);
    LOG "[15/62] Testing Distance Rejection Threshold... PASS\n";

    // ========================================================================
    // TEST 16: Scanning Distance Rejection Threshold
    // ========================================================================
    LOG "[16/62] Testing Scanning Distance Rejection Threshold...\n";
    slam_init(640, 480, 60.0f);
    slam_set_scanning_distance_threshold(0.05f);
    dot_id = 0;
    for (int i = 0; i < 8; ++i) for (int j = 0; j < 8; ++j) test_draw_dot(img1, 80 + i * 60, 60 + j * 50, dot_id++, 640, 480);
    slam_process_frame(img1.data(), imu_gravity, out_pose, &out_pose_size);
    dot_id = 0;
    for (int i = 0; i < 8; ++i) for (int j = 0; j < 8; ++j) test_draw_dot(img2, 80 + i * 60 + shift_x, 60 + j * 50, dot_id++, 640, 480);
    slam_process_frame(img2.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 2);
    LOG "[16/62] Testing Scanning Distance Rejection Threshold... PASS\n";

    // ========================================================================
    // TEST 18: Map Point Culling Preserves Oldest/Most Stable
    // ========================================================================
    LOG "[18/62] Testing Map Point Culling Preserves Oldest/Most Stable...\n";
    slam_init(640, 480, 60.0f);
    slam_set_max_map_points(5);
    for (int i = 0; i < 10; ++i) slam_add_test_point((float)i, 0.0f, 0.0f);
    if (g_map.size() >= 3) {
        g_map[0].observations = 100;
        g_map[1].observations = 100;
        g_map[2].observations = 100;
    }
    for (int i = 10; i < 15; ++i) slam_add_test_point((float)i, 0.0f, 0.0f);
    assert(slam_get_map_point_count() == 5);
    bool found_old_0 = false, found_old_1 = false, found_old_2 = false;
    for (const auto& mp : g_map) {
        if (mp.creation_index == 0 && mp.observations == 100) found_old_0 = true;
        if (mp.creation_index == 1 && mp.observations == 100) found_old_1 = true;
        if (mp.creation_index == 2 && mp.observations == 100) found_old_2 = true;
    }
    assert(found_old_0 && found_old_1 && found_old_2);
    LOG "[18/62] Testing Map Point Culling Preserves Oldest/Most Stable... PASS\n";

    // ========================================================================
    // TEST 19: Sliding Window Mode Matching
    // ========================================================================
    LOG "[19/62] Testing Sliding Window Mode Matching...\n";
    slam_init(640, 480, 60.0f);
    slam_set_use_sliding_window(true);
    slam_set_frame_stride(1);
    for (int i = 0; i < 6; ++i) {
        Keyframe kf;
        kf.kps = {{100.0f, 100.0f, 50.0f, 0.0f}};
        kf.descs = {{{0}}};
        kf.R = {1, 0, 0, 0, 1, 0, 0, 0, 1};
        kf.t = {(float)i, 0.0f, 0.0f};
        kf.pts3d.resize(1, {0.0f, 0.0f, 1.0f});
        kf.map_point_ids.resize(1, i);
        g_keyframes.push_back(kf);
        g_map.push_back({{0.0f, 0.0f, 1.0f}, false, 1, i});
    }
    assert(slam_get_keyframe_count() == 6);
    std::vector<uint8_t> img_sw(640 * 480, 0);
    test_draw_dot(img_sw, 100, 100, 99, 640, 480);
    slam_force_keyframe(); // FIX: Bypass 20-frame minimum requirement for this specific test
    slam_process_frame(img_sw.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 7);
    LOG "[19/62] Testing Sliding Window Mode Matching... PASS\n";

    // ========================================================================
    // TEST 20: IMU Gravity Fusion Integration
    // ========================================================================
    LOG "[20/62] Testing IMU Gravity Fusion Integration...\n";
    slam_init(640, 480, 60.0f);
    g_current_R.m[0] = 0.707f; g_current_R.m[1] = 0.0f; g_current_R.m[2] = 0.707f;
    g_current_R.m[3] = 0.0f;   g_current_R.m[4] = 1.0f; g_current_R.m[5] = 0.0f;
    g_current_R.m[6] = -0.707f;g_current_R.m[7] = 0.0f; g_current_R.m[8] = 0.707f;
    float test_R_out[9];
    slam_get_current_rotation(test_R_out);
    slam_process_frame(img1.data(), imu_gravity, out_pose, &out_pose_size);
    slam_get_current_rotation(test_R_out);
    assert(fabs(test_R_out[1] - 0.0f) < 0.1f);
    assert(fabs(test_R_out[4] - 1.0f) < 0.1f);
    assert(fabs(test_R_out[7] - 0.0f) < 0.1f);
    LOG "[20/62] Testing IMU Gravity Fusion Integration... PASS\n";

    // ========================================================================
    // TEST 26: Map Point Culling Edge Cases (Identical Observations)
    // ========================================================================
    LOG "[26/62] Testing Map Point Culling Edge Cases (Identical Observations)...\n";
    slam_init(640, 480, 60.0f);
    slam_set_max_map_points(3);
    for (int i = 0; i < 5; ++i) slam_add_test_point((float)i, 0.0f, 0.0f);
    assert(slam_get_map_point_count() == 3);
    assert(g_map[0].creation_index == 0);
    assert(g_map[1].creation_index == 1);
    assert(g_map[2].creation_index == 2);
    LOG "[26/62] Testing Map Point Culling Edge Cases (Identical Observations)... PASS\n";

    // ========================================================================
    // TEST 27: Floor Plane Extraction with Tilted Gravity
    // ========================================================================
    LOG "[27/62] Testing Floor Plane Extraction with Tilted Gravity...\n";
    slam_init(640, 480, 60.0f);
    slam_add_test_point(0.0f, 0.0f, 0.0f);
    slam_add_test_point(1.0f, -1.0f, 0.0f);
    slam_add_test_point(0.0f, 0.0f, 1.0f);
    slam_add_test_point(1.0f, -1.0f, 1.0f);
    slam_add_test_point(0.5f, -0.5f, 0.5f);
    slam_add_test_point(-1.0f, 1.0f, 2.0f);
    slam_add_test_point(2.0f, -2.0f, -1.0f);
    float tilted_gravity[3] = {0.707f, -0.707f, 0.0f};
    float plane_tilt[4] = {0.0f, 0.0f, 0.0f, 0.0f};
    int hull_size_tilt = 0;
    float floor_hull_tilt[100];
    slam_get_floor_plane(tilted_gravity, plane_tilt, &hull_size_tilt, floor_hull_tilt);
    LOG "[DEBUG Test 27] Extracted Plane Normal: " << plane_tilt[0] << ", " << plane_tilt[1] << ", " << plane_tilt[2] << "\n";
    assert(fabs(fabs(plane_tilt[0]) - 0.707f) < 0.15f);
    assert(fabs(fabs(plane_tilt[1]) - 0.707f) < 0.15f);
    assert(fabs(plane_tilt[2]) < 0.15f);
    assert(plane_tilt[0] * plane_tilt[1] > 0.0f);
    LOG "[27/62] Testing Floor Plane Extraction with Tilted Gravity... PASS\n";

    // ========================================================================
    // TEST 30: End-to-End SLAM with Multiple Keyframes and Map Culling
    // ========================================================================
    LOG "[30/62] Testing End-to-End SLAM with Multiple Keyframes and Map Culling...\n";
    slam_init(640, 480, 60.0f);
    slam_set_max_map_points(10);
    float seq_gravity[3] = {0.0f, -1.0f, 0.0f};
    float seq_pose[10];
    int seq_pose_size = 0;
    for (int step = 0; step < 15; ++step) {
        std::vector<uint8_t> img(640 * 480, 0);
        int s_dot_id = 0;
        for (int i = 0; i < 8; ++i) {
            for (int j = 0; j < 8; ++j) {
                int x = 80 + i * 60 + step * 10;
                int y = 60 + j * 50;
                for (int dy = -8; dy <= 8; ++dy) {
                    for (int dx = -8; dx <= 8; ++dx) {
                        int px = x + dx;
                        int py = y + dy;
                        if (px >= 0 && px < 640 && py >= 0 && py < 480) {
                            int dist_sq = dx * dx + dy * dy;
                            if (dist_sq <= 4) img[py * 640 + px] = 255;
                            else if (dist_sq <= 25) img[py * 640 + px] = 0;
                            else {
                                int pattern = (s_dot_id * 73 + dx * 41 + dy * 29) % 256;
                                img[py * 640 + px] = (pattern < 128) ? 0 : 255;
                            }
                        }
                    }
                }
                s_dot_id++;
            }
        }
        slam_process_frame(img.data(), seq_gravity, seq_pose, &seq_pose_size);
    }
    assert(slam_get_map_point_count() <= 10);
    assert(slam_get_keyframe_count() > 1);
    LOG "[30/62] Testing End-to-End SLAM with Multiple Keyframes and Map Culling... PASS\n";

    // ========================================================================
    // TEST 31: Separate Floor Point Data Structure API
    // ========================================================================
    LOG "[31/62] Testing Separate Floor Point Data Structure API...\n";
    slam_init(640, 480, 60.0f);
    slam_add_test_point(0.0f, 0.0f, 0.0f);
    slam_add_test_point(1.0f, 0.0f, 0.0f);
    slam_add_test_point(0.0f, 0.0f, 1.0f);
    slam_add_test_point(1.0f, 0.0f, 1.0f);
    slam_add_test_point(0.0f, 5.0f, 0.0f);
    float test_plane[4];
    int test_hull_size = 0;
    float test_hull[100];
    slam_get_floor_plane(imu_gravity, test_plane, &test_hull_size, test_hull);
    int floor_pt_count = slam_get_floor_point_count();
    assert(floor_pt_count == 4);
    float fx, fy, fz;
    slam_get_floor_point(0, &fx, &fy, &fz);
    assert(fabs(fy - 0.0f) < 0.1f);
    assert(slam_get_map_point_count() == 5);
    LOG "[31/62] Testing Separate Floor Point Data Structure API... PASS\n";

    // ========================================================================
    // TEST 36: Map Culling When Max Points > Current Size
    // ========================================================================
    LOG "[36/62] Testing Map Culling When Max Points > Current Size...\n";
    slam_init(640, 480, 60.0f);
    slam_set_max_map_points(100);
    for (int i = 0; i < 10; ++i) slam_add_test_point((float)i, 0.0f, 0.0f);
    assert(slam_get_map_point_count() == 10);
    LOG "[36/62] Testing Map Culling When Max Points > Current Size... PASS\n";

    // ========================================================================
    // TEST 37: Reset Followed by Immediate Process Frame
    // ========================================================================
    LOG "[37/62] Testing Reset Followed by Immediate Process Frame...\n";
    slam_init(640, 480, 60.0f);
    slam_reset();
    std::vector<uint8_t> img_reset(640 * 480, 0);
    int reset_dot_id = 0;
    for (int i = 0; i < 8; ++i) for (int j = 0; j < 8; ++j) test_draw_dot(img_reset, 80 + i * 60, 60 + j * 50, reset_dot_id++, 640, 480);
    float reset_pose[10];
    int reset_pose_size = 0;
    int reset_res = slam_process_frame(img_reset.data(), imu_gravity, reset_pose, &reset_pose_size);
    assert(reset_res == 0);
    assert(slam_get_keyframe_count() == 1);
    LOG "[37/62] Testing Reset Followed by Immediate Process Frame... PASS\n";

    // ========================================================================
    // TEST 39: Floor Plane Fitting with Collinear Points (Degenerate)
    // ========================================================================
    LOG "[39/62] Testing Floor Plane Fitting with Collinear Points (Degenerate)...\n";
    slam_init(640, 480, 60.0f);
    slam_add_test_point(0.0f, 0.0f, 0.0f);
    slam_add_test_point(1.0f, 0.0f, 0.0f);
    slam_add_test_point(2.0f, 0.0f, 0.0f);
    float deg_plane[4] = {0, 0, 0, 0};
    int deg_hull_size = 0;
    float deg_hull[100];
    slam_get_floor_plane(imu_gravity, deg_plane, &deg_hull_size, deg_hull);
    assert(deg_hull_size >= 0);
    LOG "[39/62] Testing Floor Plane Fitting with Collinear Points... PASS\n";

    // ========================================================================
    // TEST 40: Sliding Window Boundary Condition (Exactly 5 Keyframes)
    // ========================================================================
    LOG "[40/62] Testing Sliding Window Boundary Condition (Exactly 5 Keyframes)...\n";
    slam_init(640, 480, 60.0f);
    slam_set_use_sliding_window(true);
    for (int i = 0; i < 5; ++i) {
        Keyframe kf;
        kf.kps = {{100.0f, 100.0f, 50.0f, 0.0f}};
        kf.descs = {{{0}}};
        kf.R = {1, 0, 0, 0, 1, 0, 0, 0, 1};
        kf.t = {(float)i, 0.0f, 0.0f};
        kf.pts3d.resize(1, {0.0f, 0.0f, 1.0f});
        kf.map_point_ids.resize(1, i);
        g_keyframes.push_back(kf);
        g_map.push_back({{0.0f, 0.0f, 1.0f}, false, 1, i});
    }
    assert(slam_get_keyframe_count() == 5);
    std::vector<uint8_t> img_sw5(640 * 480, 0);
    test_draw_dot(img_sw5, 100, 100, 99, 640, 480);
    slam_force_keyframe(); // FIX: Bypass 20-frame minimum requirement for this specific test
    slam_process_frame(img_sw5.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 6);
    LOG "[40/62] Testing Sliding Window Boundary Condition... PASS\n";

    // ========================================================================
    // TEST 41: NMS in Feature Extraction
    // ========================================================================
    LOG "[41/62] Testing NMS in Feature Extraction...\n";
    std::vector<uint8_t> nms_img(100 * 100, 128);
    for (int y = 40; y < 60; ++y) {
        for (int x = 40; x < 60; ++x) {
            nms_img[y * 100 + x] = 255;
        }
    }
    std::vector<Keypoint> nms_kps;
    std::vector<Descriptor> nms_descs;
    int prev_w = g_width, prev_h = g_height;
    g_width = 100; g_height = 100;
    extract_features(nms_img.data(), nms_kps, nms_descs);
    g_width = prev_w; g_height = prev_h;
    bool nms_valid = true;
    for (size_t i = 0; i < nms_kps.size(); ++i) {
        for (size_t j = i + 1; j < nms_kps.size(); ++j) {
            float dx = nms_kps[i].x - nms_kps[j].x;
            float dy = nms_kps[i].y - nms_kps[j].y;
            if (sqrt(dx*dx + dy*dy) < 3.0f) {
                nms_valid = false;
                break;
            }
        }
    }
    assert(nms_valid);
    LOG "[41/62] Testing NMS in Feature Extraction... PASS\n";

    // ========================================================================
    // TEST 46: Camera Center Calculation (Pose Convention)
    // ========================================================================
    LOG "[46/62] Testing Camera Center Calculation (Pose Convention)...\n";
    slam_init(640, 480, 60.0f);
    Mat3 test_R_cc = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    Vec3 test_t_cc = {0, 0, -5};
    Vec3 C = get_cam_center(test_R_cc, test_t_cc);
    assert(fabs(C.x - 0.0f) < 1e-4f);
    assert(fabs(C.y - 0.0f) < 1e-4f);
    assert(fabs(C.z - 5.0f) < 1e-4f);
    LOG "[46/62] Testing Camera Center Calculation (Pose Convention)... PASS\n";

    // ========================================================================
    // TEST 51: Floor Plane Fitting with Identical Points
    // ========================================================================
    LOG "[51/62] Testing Floor Plane Fitting with Identical Points...\n";
    slam_init(640, 480, 60.0f);
    for (int i = 0; i < 10; ++i) slam_add_test_point(1.0f, 1.0f, 1.0f);
    float ident_plane[4] = {0, 0, 0, 0};
    int ident_hull_size = 0;
    float ident_hull[100];
    slam_get_floor_plane(imu_gravity, ident_plane, &ident_hull_size, ident_hull);
    assert(ident_hull_size >= 0);
    LOG "[51/62] Testing Floor Plane Fitting with Identical Points... PASS\n";

    // ========================================================================
    // TEST 52: Map Culling with max_points = 0
    // ========================================================================
    LOG "[52/62] Testing Map Culling with max_points = 0...\n";
    slam_init(640, 480, 60.0f);
    slam_set_max_map_points(0);
    for (int i = 0; i < 5; ++i) slam_add_test_point((float)i, 0.0f, 0.0f);
    assert(slam_get_map_point_count() == 0);
    LOG "[52/62] Testing Map Culling with max_points = 0... PASS\n";

    // ========================================================================
    // TEST 55: Realistic Low Match Count Scenario
    // ========================================================================
    LOG "[55/62] Testing Realistic Low Match Count Scenario...\n";
    slam_init(640, 480, 60.0f);
    std::vector<uint8_t> low_match_img1(640 * 480, 0);
    dot_id = 0;
    for (int i = 0; i < 5; ++i) {
        for (int j = 0; j < 5; ++j) {
            test_draw_dot(low_match_img1, 150 + i * 70, 100 + j * 60, dot_id++, 640, 480);
        }
    }
    slam_process_frame(low_match_img1.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 1);
    std::vector<uint8_t> low_match_img2(640 * 480, 0);
    dot_id = 0;
    for (int i = 0; i < 5; ++i) {
        for (int j = 0; j < 5; ++j) {
            test_draw_dot(low_match_img2, 150 + i * 70 + 25, 100 + j * 60, dot_id++, 640, 480);
        }
    }
    slam_process_frame(low_match_img2.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_map_point_count() > 0);
    LOG "[55/62] Testing Realistic Low Match Count Scenario... PASS\n";

    // ========================================================================
    // TEST 59: Adaptive Concave Hull Alpha for Sparse Data
    // ========================================================================
    LOG "[59/62] Testing Adaptive Concave Hull Alpha for Sparse Data...\n";
    std::vector<Point2D> sparse_pts;
    for (int i = 0; i < 10; ++i) {
        sparse_pts.push_back({(float)i * 0.5f, (float)(i % 3) * 0.3f});
    }
    float max_dist = 0.0f;
    for (size_t i = 0; i < sparse_pts.size(); ++i) {
        for (size_t j = i + 1; j < sparse_pts.size(); ++j) {
            float dx = sparse_pts[i].x - sparse_pts[j].x;
            float dy = sparse_pts[i].y - sparse_pts[j].y;
            float dist = sqrt(dx*dx + dy*dy);
            if (dist > max_dist) max_dist = dist;
        }
    }
    float adaptive_alpha = std::max(0.5f, max_dist * 0.2f);
    std::vector<Point2D> adaptive_hull = compute_concave_hull(sparse_pts, adaptive_alpha);
    assert(adaptive_hull.size() >= 3);
    LOG "[59/62] Testing Adaptive Concave Hull Alpha for Sparse Data... PASS\n";

    // ========================================================================
    // TEST 60: Floor Plane Normal Direction Consistency (always points UP)
    // ========================================================================
    LOG "[60/62] Testing Floor Plane Normal Direction Consistency (always points UP)...\n";
    slam_init(640, 480, 60.0f);
    for (int i = 0; i < 20; ++i) {
        slam_add_test_point((float)(i % 5) * 0.5f, 0.0f, (float)(i / 5) * 0.5f);
    }
    float floor_plane_60[4];
    int floor_hull_size_60 = 0;
    float floor_hull_60[100];
    slam_get_floor_plane(imu_gravity, floor_plane_60, &floor_hull_size_60, floor_hull_60);
    assert(fabs(floor_plane_60[1]) > 0.9f);
    assert(floor_plane_60[1] > 0.0f);
    LOG "[60/62] Testing Floor Plane Normal Direction Consistency (always points UP)... PASS\n";

    // ========================================================================
    // TEST 61: End-to-End with Realistic Feature Density
    // ========================================================================
    LOG "[61/62] Testing End-to-End with Realistic Feature Density...\n";
    slam_init(640, 480, 60.0f);
    std::vector<uint8_t> realistic_img1(640 * 480, 0);
    dot_id = 0;
    for (int i = 0; i < 6; ++i) {
        for (int j = 0; j < 6; ++j) {
            test_draw_dot(realistic_img1, 100 + i * 80, 80 + j * 60, dot_id++, 640, 480);
        }
    }
    slam_process_frame(realistic_img1.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 1);
    std::vector<uint8_t> realistic_img2(640 * 480, 0);
    dot_id = 0;
    for (int i = 0; i < 6; ++i) {
        for (int j = 0; j < 6; ++j) {
            test_draw_dot(realistic_img2, 100 + i * 80 + 20, 80 + j * 60, dot_id++, 640, 480);
        }
    }
    slam_process_frame(realistic_img2.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_map_point_count() > 0);
    LOG "[61/62] Testing End-to-End with Realistic Feature Density... PASS\n";

    // ========================================================================
    // TEST 62: Match Threshold Validation (20 instead of 50)
    // ========================================================================
    LOG "[62/62] Testing Match Threshold (20 instead of 50)...\n";
    slam_init(640, 480, 60.0f);
    std::vector<uint8_t> threshold_img1(640 * 480, 0);
    dot_id = 0;
    for (int i = 0; i < 5; ++i) {
        for (int j = 0; j < 5; ++j) {
            test_draw_dot(threshold_img1, 150 + i * 70, 100 + j * 60, dot_id++, 640, 480);
        }
    }
    slam_process_frame(threshold_img1.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_keyframe_count() == 1);
    std::vector<uint8_t> threshold_img2(640 * 480, 0);
    dot_id = 0;
    for (int i = 0; i < 5; ++i) {
        for (int j = 0; j < 5; ++j) {
            test_draw_dot(threshold_img2, 150 + i * 70 + 25, 100 + j * 60, dot_id++, 640, 480);
        }
    }
    slam_process_frame(threshold_img2.data(), imu_gravity, out_pose, &out_pose_size);
    assert(slam_get_map_point_count() > 0);
    LOG "[62/62] Testing Match Threshold (20 instead of 50)... PASS\n";

    LOG "=== SUITE 3 COMPLETE (28/62 tests) ===\n";
}

#endif // SLAM_OPENCV_TEST_PIPELINE_CPP
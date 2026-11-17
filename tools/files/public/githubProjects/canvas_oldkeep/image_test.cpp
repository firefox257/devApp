// image_test.cpp
#include <autogen.hpp>
#include <fetch_ext.hpp> // Required for the fetch() extension
#include <cstdint>
#include "image.cpp"

// ============================================================================
// 1. THREAD CONFIGURATION
// ============================================================================
ag_dedicated_thread_count(1);
ag_undedicated_thread_count(2);

// ============================================================================
// 2. GLOBAL STATE
// ============================================================================
Image* g_testImage = nullptr;

struct ImageInfo {
    uint32_t width;
    uint32_t height;
    uint32_t channels;
    uint32_t data_ptr; 
    uint32_t dpi_x;
    uint32_t dpi_y;
};

// ============================================================================
// 3. EXPORTED FUNCTIONS
// ============================================================================
ag_export(test_load_image)
ag_future* test_load_image(const char* url) {
    if (g_testImage) {
        delete g_testImage; 
        g_testImage = nullptr;
    }
    g_testImage = new Image(); 
    
    msginfo << "Fetching image from: " << url;
    
    // Use the fetch extension to download the image binary
    ag_future* fut = fetch(url);
    uint32_t structPtr = ag_await(uint32_t, fut);
    
    if (structPtr == 0) {
        msgerr << "Fetch failed or returned null pointer.";
        ag_return 0;
    }
    
    FetchResult* res = (FetchResult*)(uintptr_t)structPtr;
    
    if (res->status_code == 200 && res->data_ptr != 0 && res->size > 0) {
        // Load from memory. Request 4 channels (RGBA) for HTML Canvas compatibility.
        bool success = g_testImage->loadFromMemory((const unsigned char*)(uintptr_t)res->data_ptr, res->size, 4);
        
        // CLEANUP: Free the shared memory allocated by the JS fetch extension
        if (res->data_ptr != 0) free((void*)(uintptr_t)res->data_ptr);
        free((void*)(uintptr_t)structPtr);
        
        if (success) {
            msginfo << "Test completed: Image decoded successfully (" << g_testImage->getWidth() << "x" << g_testImage->getHeight() << ").";
            ag_return 1;
        } else {
            msgerr << "Image decoding failed: " << Image::getFailureReason();
            ag_return 0;
        }
    } else {
        msgwarn << "Fetch completed with status: " << res->status_code;
        if (res->data_ptr != 0) free((void*)(uintptr_t)res->data_ptr);
        free((void*)(uintptr_t)structPtr);
        ag_return 0;
    }
}

ag_export(get_image_info)
uint32_t get_image_info() {
    if (!g_testImage || !g_testImage->getData()) {
        return 0;
    }
    
    ImageInfo* info = (ImageInfo*)malloc(sizeof(ImageInfo));
    
    // Use public getters instead of accessing private members
    info->width = g_testImage->getWidth();
    info->height = g_testImage->getHeight();
    info->channels = g_testImage->getChannels();
    info->data_ptr = (uint32_t)(uintptr_t)g_testImage->getData();
    info->dpi_x = g_testImage->getDpiX();
    info->dpi_y = g_testImage->getDpiY();
    
    return (uint32_t)(uintptr_t)info;
}
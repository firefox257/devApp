// test_fetch.cpp
#include <autogen.hpp>
#include <cstring>
#include "fetch_ext.hpp"

// STEP 1: Define topology
ag_dedicated_thread_count(1);
ag_undedicated_thread_count(1);

// STEP 2: Export test function. MUST return ag_future* because it uses ag_await
ag_export(test_fetch_url)
ag_future* test_fetch_url(const char* url) {
    msginfo << "Starting fetch for URL: " << url;
    
    // Call the async extension (returns ag_future* containing a uint32_t pointer)
    ag_future* fut = fetch(url);
    
    // Await the result pointer (Yields to JS event loop)
    uint32_t structPtr = ag_await(uint32_t, fut);
    
    if (structPtr == 0) {
        msgwarn << "Fetch failed or returned null pointer (check console for JS errors)";
        ag_return 0;
    }
    
    // Manually cast the pointer to FetchResult to read the 16-byte struct from shared memory
    FetchResult* res = (FetchResult*)(uintptr_t)structPtr;
    
    if (res->status_code == 200 && res->data_ptr != 0 && res->size > 0) {
        // Allocate space for data + 1 byte for null terminator using standard C++ malloc
        char* null_terminated_data = (char*)malloc(res->size + 1);
        if (null_terminated_data) {
            memcpy(null_terminated_data, (const void*)(uintptr_t)res->data_ptr, res->size);
            null_terminated_data[res->size] = '\0';
            
            msginfo << "\n--- FETCHED CONTENT ---\n" 
                    << null_terminated_data 
                    << "\n-----------------------";
            
            free(null_terminated_data);
        }
    } else {
        msgwarn << "Fetch completed with status: " << res->status_code;
    }
    
    // Manually free the inner payload buffer and the struct itself 
    // (The JS library only auto-frees the 4-byte primitive wrapper, not the actual payload)
    if (res->data_ptr != 0) {
        free((void*)(uintptr_t)res->data_ptr);
    }
    free((void*)(uintptr_t)structPtr);
    
    ag_return res->status_code;
}
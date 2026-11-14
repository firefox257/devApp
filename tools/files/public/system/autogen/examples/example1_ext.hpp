#ifndef EXAMPLE1_EXT_HPP
#define EXAMPLE1_EXT_HPP

#include "autogen.hpp"

namespace ext {

    // Fire-and-Forget: Send a log message to the Main Thread UI
    inline void ui_add_log(uint32_t level, uint32_t value) {
        ag_ext_fire(ag_ext::main, "ui_add_log", level, value);
    }

    // Synchronous: Get a random seed from the Main Thread
    inline uint32_t get_main_thread_seed() {
        return ag_ext_sync(uint32_t, ag_ext::main, "get_main_thread_seed");
    }

    // Asynchronous: Perform a mock computation on the local Worker
    inline ag_future* worker_mock_fetch(uint32_t request_id) {
        return ag_ext_async(uint32_t, ag_ext::worker, "worker_mock_fetch", request_id);
    }

} // namespace ext

#endif // EXAMPLE1_EXT_HPP
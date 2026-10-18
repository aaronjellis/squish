# Builds transcode.js and transcode.wasm: libjxl plus transcode.c, single
# thread, for vendor/jpeg-to-jxl/dist. Run through scripts/build-jxl-transcode.sh.
#
# Copyright (c) 2026, ChefJulio (jpeg-to-jxl). BSD-3-Clause; see LICENSE in
# this directory. Adapted from build/CMakeLists.txt at tag v0.2.0 of
# https://github.com/ChefJulio/jpeg-to-jxl: the libjxl checkout comes from
# LIBJXL_DIR instead of a fixed relative path, JPEGXL_ENABLE_WASM_THREADS is
# off (libjxl v0.12.0 adds -pthread otherwise), and the source lives next to
# this file.
cmake_minimum_required(VERSION 3.16)
project(jxl_transcode_wasm C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

set(LIBJXL_DIR "" CACHE PATH "Path to a libjxl checkout with its submodules")
if(NOT EXISTS "${LIBJXL_DIR}/CMakeLists.txt")
  message(FATAL_ERROR "Set -DLIBJXL_DIR to a libjxl checkout (got '${LIBJXL_DIR}')")
endif()

# libjxl: only the encoder and decoder with JPEG transcoding. Every flag
# matters for wasm size.
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_BENCHMARK OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_DOXYGEN OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_EXAMPLES OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_JNI OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_JPEGLI OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_MANPAGES OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_OPENEXR OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_PLUGINS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_SJPEG OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_SKCMS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_TOOLS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_VIEWERS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_TRANSCODE_JPEG ON CACHE BOOL "" FORCE)

# Single thread: no pthreads means no SharedArrayBuffer and no cross-origin
# isolation headers, which the host does not send. libjxl's
# find_package(Threads REQUIRED) is satisfied without linking pthreads.
set(THREADS_PREFER_PTHREAD_FLAG OFF CACHE BOOL "" FORCE)
set(CMAKE_USE_PTHREADS_INIT OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_WASM_THREADS OFF CACHE BOOL "" FORCE)
set(JPEGXL_FORCE_NEON OFF CACHE BOOL "" FORCE)
set(HWY_ENABLE_THREADS OFF CACHE BOOL "" FORCE)
set(HWY_SYSTEM_GTEST OFF CACHE BOOL "" FORCE)
set(HWY_ENABLE_TESTS OFF CACHE BOOL "" FORCE)
set(HWY_ENABLE_EXAMPLES OFF CACHE BOOL "" FORCE)

add_subdirectory("${LIBJXL_DIR}" "${CMAKE_BINARY_DIR}/libjxl")

add_executable(transcode "${CMAKE_CURRENT_SOURCE_DIR}/transcode.c")

# Emscripten's libjpeg port provides jpeglib.h for the lossy fallback.
target_compile_options(transcode PRIVATE "SHELL:-s USE_LIBJPEG=1")

target_link_libraries(transcode PRIVATE jxl jxl_dec)

target_include_directories(transcode PRIVATE
  "${LIBJXL_DIR}/lib/include"
  "${CMAKE_BINARY_DIR}/libjxl/lib/include"  # generated jxl/version.h
)

# MODULARIZE + EXPORT_ES6: an ES module whose default export is the factory.
# ALLOW_MEMORY_GROWTH: the heap grows for large files.
# MALLOC=emmalloc: the smaller allocator.
# SINGLE_FILE=0: keep the .wasm separate so the browser can cache it.
# -Oz: smallest output; transcoding is fast enough either way.
# -flto was measured upstream and made the output larger, so it stays off.
set_target_properties(transcode PROPERTIES
  SUFFIX ".js"
  LINK_FLAGS "\
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s EXPORTED_FUNCTIONS=['_jpeg_to_jxl','_jxl_to_jpeg','_jxl_to_jpeg_lossy','_jxl_free','_malloc','_free'] \
    -s EXPORTED_RUNTIME_METHODS=['HEAPU8','HEAPU32'] \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=16777216 \
    -s STACK_SIZE=1048576 \
    -s ENVIRONMENT='web,worker,node' \
    -s FILESYSTEM=0 \
    -s SINGLE_FILE=0 \
    -s MALLOC=emmalloc \
    -s USE_PTHREADS=0 \
    -s USE_LIBJPEG=1 \
    -Oz \
    --closure 1 \
  "
)

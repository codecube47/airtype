{
  "targets": [
    {
      "target_name": "fn_key",
      "sources": ["fn_key.mm"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          },
          "link_settings": {
            "libraries": [
              "-framework ApplicationServices",
              "-framework CoreFoundation",
              "-framework AppKit"
            ]
          }
        }]
      ]
    }
  ]
}

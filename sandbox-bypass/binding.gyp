{
  "targets": [
    {
      "target_name": "sandbox",
      "sources": ["sandbox.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "UNICODE",
        "_UNICODE"
      ],
      "conditions": [
        ["OS=='win'", {
          "libraries": [
            "-luser32.lib",
            "-ladvapi32.lib",
            "-lntdll.lib",
            "-lpsapi.lib",
            "-lkernel32.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "RuntimeLibrary": 2,
              "RuntimeTypeInfo": "true",
              "WarningLevel": 3
            },
            "VCLinkerTool": {
              "SubSystem": 1,
              "GenerateDebugInformation": "true"
            }
          }
        }]
      ]
    }
  ]
}
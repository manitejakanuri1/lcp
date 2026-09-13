# Vendored shim wheel

`opencv_python-4.14.0.94-py3-none-any.whl` is a shim, not OpenCV. It carries the
`opencv-python` distribution name, declares a dependency on `opencv-python-headless`,
and contains no modules whatsoever — the whole wheel is about 1 KB.

## Why it exists

`rapidocr` requires `opencv-python`, the desktop build. That wheel installs into the
same `cv2/` directory as `opencv-python-headless`, so the two cannot coexist —
whichever pip or uv writes last is the one that gets imported. On Vercel's runtime
the desktop build fails outright:

```
ImportError: libGL.so.1: cannot open shared object file
ImportError: libxcb.so.1: cannot open shared object file   # the 5.x headless build too
```

Because install order is not deterministic, the deployed function alternated between
working and failing across identical deploys.

`api/overrides.txt` redirects the `opencv-python` requirement to this shim, so
`rapidocr`'s dependency is satisfied while `opencv-python-headless` stays the only
real `cv2` on disk. uv reads that file via the `UV_OVERRIDE` environment variable set
on the Vercel project.

## Regenerating it

The wheel is two metadata files in a zip; nothing is compiled. If the pinned OpenCV
version changes, rebuild it with a matching version number — the shim's version only
has to satisfy `rapidocr`'s `opencv_python>=4.5.1.48` constraint.

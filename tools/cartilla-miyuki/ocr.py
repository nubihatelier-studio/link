"""OCR con el reconocimiento de texto que ya trae macOS (Vision)."""
import Quartz, Vision
from Foundation import NSURL

def read(path: str):
    url = NSURL.fileURLWithPath_(path)
    src = Quartz.CGImageSourceCreateWithURL(url, None)
    img = Quartz.CGImageSourceCreateImageAtIndex(src, 0, None)
    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    req.setUsesLanguageCorrection_(False)
    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(img, None)
    handler.performRequests_error_([req], None)
    out = []
    W = Quartz.CGImageGetWidth(img); H = Quartz.CGImageGetHeight(img)
    for obs in req.results():
        txt = obs.topCandidates_(1)[0].string()
        bb = obs.boundingBox()
        x = bb.origin.x * W; y = (1 - bb.origin.y - bb.size.height) * H
        out.append({'text': txt, 'x': round(x), 'y': round(y), 'w': round(bb.size.width*W), 'h': round(bb.size.height*H)})
    return out

if __name__ == '__main__':
    import sys, re
    res = read(sys.argv[1])
    codes = [r for r in res if re.fullmatch(r'DB[-\s]?\d+[A-Z]?', r['text'].strip())]
    print('textos:', len(res), ' códigos DB:', len(codes))
    for r in codes[:10]:
        print(' ', r['text'], r['x'], r['y'])

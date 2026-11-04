import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count > 1 else { FileHandle.standardError.write("usage: ocr <image>".data(using: .utf8)!); exit(1) }
let url = URL(fileURLWithPath: args[1])
guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write("cannot read image".data(using: .utf8)!); exit(2)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = true
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do { try handler.perform([request]) } catch { FileHandle.standardError.write("ocr failed: \(error)".data(using: .utf8)!); exit(3) }
var lines: [String] = []
for obs in request.results ?? [] {
  if let c = obs.topCandidates(1).first { lines.append(c.string) }
}
print(lines.joined(separator: "\n"))

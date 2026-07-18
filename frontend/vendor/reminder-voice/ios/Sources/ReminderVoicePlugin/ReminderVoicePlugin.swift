import AVFoundation
import Capacitor
import Foundation

/// Renders the device text-to-speech voice into a file under Library/Sounds —
/// the directory UNNotificationSound resolves names against — so reminders
/// can speak with a natural voice even when the backend TTS is unavailable.
@objc(ReminderVoicePlugin)
public class ReminderVoicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReminderVoicePlugin"
    public let jsName = "ReminderVoice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "synthesizeToSound", returnType: CAPPluginReturnPromise)
    ]

    // Synthesizers must outlive their write callback; kept here until done.
    private var active: [AVSpeechSynthesizer] = []

    @objc func synthesizeToSound(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), !text.isEmpty,
              let fileName = call.getString("fileName"), !fileName.isEmpty else {
            call.reject("text and fileName are required")
            return
        }

        let utterance = AVSpeechUtterance(string: text)
        if let language = call.getString("language"),
           let voice = AVSpeechSynthesisVoice(language: language) {
            utterance.voice = voice
        } else {
            utterance.voice = AVSpeechSynthesisVoice(
                language: AVSpeechSynthesisVoice.currentLanguageCode())
        }
        if let rate = call.getFloat("rate") {
            utterance.rate = rate
        }

        let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        let soundsDir = library.appendingPathComponent("Sounds", isDirectory: true)
        do {
            try FileManager.default.createDirectory(
                at: soundsDir, withIntermediateDirectories: true)
        } catch {
            call.reject("could not create Sounds directory: \(error.localizedDescription)")
            return
        }
        let fileURL = soundsDir.appendingPathComponent(fileName)
        try? FileManager.default.removeItem(at: fileURL)

        let synthesizer = AVSpeechSynthesizer()
        active.append(synthesizer)
        var audioFile: AVAudioFile?
        var writeError: Error?
        var finished = false

        synthesizer.write(utterance) { [weak self] buffer in
            guard !finished, let pcm = buffer as? AVAudioPCMBuffer else { return }

            // A zero-length buffer marks the end of the utterance.
            if pcm.frameLength == 0 {
                finished = true
                DispatchQueue.main.async {
                    self?.active.removeAll { $0 === synthesizer }
                }
                if let error = writeError {
                    try? FileManager.default.removeItem(at: fileURL)
                    call.reject("writing audio failed: \(error.localizedDescription)")
                } else if audioFile == nil {
                    call.reject("synthesis produced no audio")
                } else {
                    call.resolve(["fileName": fileName])
                }
                return
            }

            do {
                if audioFile == nil {
                    // File format: 16-bit linear PCM (CAF), which notification
                    // sounds accept. AVAudioFile converts from the float
                    // processing buffers on write.
                    var settings = pcm.format.settings
                    settings[AVFormatIDKey] = kAudioFormatLinearPCM
                    settings[AVLinearPCMBitDepthKey] = 16
                    settings[AVLinearPCMIsFloatKey] = false
                    settings[AVLinearPCMIsNonInterleaved] = false
                    audioFile = try AVAudioFile(
                        forWriting: fileURL,
                        settings: settings,
                        commonFormat: pcm.format.commonFormat,
                        interleaved: pcm.format.isInterleaved)
                }
                try audioFile?.write(from: pcm)
            } catch {
                writeError = error
            }
        }
    }
}

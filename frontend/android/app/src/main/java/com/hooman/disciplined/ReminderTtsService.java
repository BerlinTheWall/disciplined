package com.hooman.disciplined;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import androidx.core.app.NotificationCompat;

import java.io.IOException;
import java.util.Locale;
import java.util.UUID;

// Speaks a reminder aloud when ReminderTtsPlugin's alarm fires. Runs as a
// foreground service because Android kills plain background work within
// seconds, and playback/synthesis needs longer than that to finish.
//
// Prefers playing the exact natural-voice (Amy/Frank) WAV already synthesized
// for iOS's notification sound (see reminderAudio.ts) when one's ready — that
// way the selected voice is honored on Android too, and there's no TTS-engine
// cold start. Falls back to the on-device TextToSpeech engine reading the raw
// text when no file is available yet (synthesis still pending, offline, etc).
//
// This posts its own low-importance notification (Android requires a
// foreground service to show one) on a separate, silent channel from
// "reminders" — the actual reminder banner is a completely separate
// notification scheduled by nativeReminders.ts, and it already uses the
// high-importance channel. This one is just the mandatory plumbing and should
// stay invisible in practice.
public class ReminderTtsService extends Service {
    private static final String CHANNEL_ID = "reminder_tts";
    private static final int NOTIF_ID = 8420;
    // Safety net if playback/synthesis never completes (bad file, TTS init
    // failure, OEM quirks) — never hold the foreground service open forever.
    private static final long MAX_MS = 20_000;

    private TextToSpeech tts;
    private MediaPlayer mediaPlayer;
    private final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private final Runnable timeoutRunnable = this::stopSelf;

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Reminder speech", NotificationManager.IMPORTANCE_MIN);
        channel.setShowBadge(false);
        nm.createNotificationChannel(channel);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIF_ID, buildNotification());

        String text = intent != null ? intent.getStringExtra("text") : null;
        String soundUri = intent != null ? intent.getStringExtra("soundUri") : null;

        if (soundUri == null && (text == null || text.isEmpty())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        timeoutHandler.postDelayed(timeoutRunnable, MAX_MS);
        if (soundUri != null) {
            playFile(soundUri, text);
        } else {
            speakText(text);
        }

        return START_NOT_STICKY;
    }

    private void playFile(String soundUri, String fallbackText) {
        try {
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, Uri.parse(soundUri));
            mediaPlayer.setOnPreparedListener(MediaPlayer::start);
            mediaPlayer.setOnCompletionListener(mp -> stopSelf());
            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                releaseMediaPlayer();
                fallbackToSpeech(fallbackText);
                return true;
            });
            mediaPlayer.prepareAsync();
        } catch (IOException | IllegalArgumentException e) {
            fallbackToSpeech(fallbackText);
        }
    }

    private void fallbackToSpeech(String text) {
        if (text != null && !text.isEmpty()) {
            speakText(text);
        } else {
            stopSelf();
        }
    }

    private void speakText(String text) {
        tts = new TextToSpeech(getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS) {
                stopSelf();
                return;
            }
            tts.setLanguage(Locale.getDefault());
            tts.setOnUtteranceProgressListener(
                new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {}

                    @Override
                    public void onDone(String utteranceId) {
                        stopSelf();
                    }

                    @Override
                    public void onError(String utteranceId) {
                        stopSelf();
                    }
                }
            );
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), UUID.randomUUID().toString());
        });
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Speaking reminder")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .build();
    }

    private void releaseMediaPlayer() {
        if (mediaPlayer != null) {
            mediaPlayer.release();
            mediaPlayer = null;
        }
    }

    @Override
    public void onDestroy() {
        timeoutHandler.removeCallbacks(timeoutRunnable);
        releaseMediaPlayer();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

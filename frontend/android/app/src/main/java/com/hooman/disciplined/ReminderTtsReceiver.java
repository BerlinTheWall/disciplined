package com.hooman.disciplined;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

// Fired by the AlarmManager alarm scheduled in ReminderTtsPlugin. Hands off to
// a foreground service immediately — speech synthesis and playback take a few
// seconds, longer than a broadcast receiver is allowed to run.
public class ReminderTtsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String text = intent.getStringExtra("text");
        String soundUri = intent.getStringExtra("soundUri");
        if ((text == null || text.isEmpty()) && soundUri == null) {
            return;
        }
        Intent serviceIntent = new Intent(context, ReminderTtsService.class);
        serviceIntent.putExtra("text", text);
        if (soundUri != null) {
            serviceIntent.putExtra("soundUri", soundUri);
        }
        ContextCompat.startForegroundService(context, serviceIntent);
    }
}

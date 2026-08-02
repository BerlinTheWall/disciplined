package com.hooman.disciplined;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Iterator;

// Android has no way to play a runtime-generated audio file as a scheduled
// local notification's sound — LocalNotification's `sound` only resolves
// bundled res/raw resources (see nativeReminders.ts / nativeTts.ts for the
// full explanation). So on Android, reminder speech is a second, independent
// alarm that speaks the line aloud via the on-device TextToSpeech engine when
// it fires (see ReminderTtsReceiver / ReminderTtsService), instead of
// pre-synthesizing audio like iOS does.
@CapacitorPlugin(name = "ReminderTts")
public class ReminderTtsPlugin extends Plugin {

    private static final String PREFS = "reminder_tts";
    // JSON object mapping id -> "at|text" for everything currently scheduled,
    // so a call only touches AlarmManager for ids that are new, changed, or
    // removed. The caller (nativeReminders.ts) always passes its full desired
    // set on every sync, which happens far more often than a reminder nears
    // its fire time — unconditionally cancelling and rescheduling everything
    // every call raced with the OS delivering an alarm that was about to
    // fire, and separately caused already-fired reminders to be needlessly
    // rescheduled (and re-spoken) again on every subsequent sync.
    private static final String KEY_STATE = "scheduled_state";

    @PluginMethod
    public void scheduleBatch(PluginCall call) {
        JSArray items = call.getArray("items");
        if (items == null) {
            call.reject("items is required");
            return;
        }

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        JSONObject previous = readState(prefs);
        JSONObject desired = new JSONObject();
        try {
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                int id = item.getInt("id");
                String text = item.getString("text");
                long at = item.getLong("at");
                String soundUri = item.optString("soundUri", "");
                desired.put(String.valueOf(id), at + "|" + text + "|" + soundUri);
            }
        } catch (JSONException e) {
            call.reject("Invalid item", e);
            return;
        }

        // Cancel ids that are no longer wanted, or whose signature changed —
        // a changed alarm needs its old PendingIntent extras replaced.
        Iterator<String> keys = previous.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String prevSig = previous.optString(key, null);
            String newSig = desired.optString(key, null);
            if (newSig == null || !newSig.equals(prevSig)) {
                alarmManager.cancel(pendingIntentFor(context, Integer.parseInt(key), null, null));
            }
        }

        // Schedule ids that are new or changed; unchanged ones are left
        // completely untouched, so an about-to-fire (or just-fired) alarm is
        // never at risk of being cancelled by an unrelated resync.
        try {
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                int id = item.getInt("id");
                String key = String.valueOf(id);
                String newSig = desired.optString(key, null);
                if (newSig != null && newSig.equals(previous.optString(key, null))) {
                    continue;
                }
                String text = item.getString("text");
                long at = item.getLong("at");
                String soundUri = item.has("soundUri") ? item.getString("soundUri") : null;
                scheduleAlarm(alarmManager, at, pendingIntentFor(context, id, text, soundUri));
            }
        } catch (JSONException e) {
            call.reject("Invalid item", e);
            return;
        }

        prefs.edit().putString(KEY_STATE, desired.toString()).apply();
        call.resolve();
    }

    // setAndAllowWhileIdle lets Android batch/delay delivery by a fair amount
    // for power savings — fine for most things, but it's what caused the
    // reminder to visibly speak several seconds after its (exactly-scheduled)
    // notification appeared. Exact scheduling requires the user to grant
    // "Alarms & reminders" special access on Android 13+ (see
    // requestExactAlarmPermission) — fall back to the loose variant if it
    // isn't granted rather than crashing.
    private void scheduleAlarm(AlarmManager alarmManager, long at, PendingIntent pendingIntent) {
        boolean canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms();
        if (canExact) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pendingIntent);
        } else {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pendingIntent);
        }
    }

    // Opens the system's direct grant screen for exact-alarm scheduling,
    // same idea as requestBatteryExemption. Android 13+ only — on older
    // versions exact alarms need no special permission at all.
    @PluginMethod
    public void requestExactAlarmPermission(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager.canScheduleExactAlarms()) {
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
        intent.setData(Uri.parse("package:" + context.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        result.put("granted", false);
        call.resolve(result);
    }

    @PluginMethod
    public void isExactAlarmAllowed(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.put("granted", true);
        } else {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            result.put("granted", alarmManager.canScheduleExactAlarms());
        }
        call.resolve(result);
    }

    // Without this exemption, Android throws
    // ForegroundServiceStartNotAllowedException when the alarm-triggered
    // ReminderTtsReceiver tries to start ReminderTtsService — a plain
    // AlarmManager alarm does not, by itself, grant an app permission to
    // start a foreground service from the background. This opens the
    // system's direct "Allow this app to ignore battery optimizations?"
    // dialog, the standard mechanism alarm/reminder apps use for exactly
    // this.
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        Context context = getContext();
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        String packageName = context.getPackageName();
        JSObject result = new JSObject();
        if (powerManager.isIgnoringBatteryOptimizations(packageName)) {
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + packageName));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        result.put("granted", false);
        call.resolve(result);
    }

    @PluginMethod
    public void isBatteryExempt(PluginCall call) {
        Context context = getContext();
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        JSObject result = new JSObject();
        result.put("granted", powerManager.isIgnoringBatteryOptimizations(context.getPackageName()));
        call.resolve(result);
    }

    private static JSONObject readState(SharedPreferences prefs) {
        String raw = prefs.getString(KEY_STATE, null);
        if (raw == null) {
            return new JSONObject();
        }
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    // `text`/`soundUri` are omitted when reconstructing a PendingIntent purely
    // to cancel it — PendingIntent matching only looks at the Intent's
    // action/component/data, not extras, so it doesn't need to match what was
    // originally scheduled.
    private static PendingIntent pendingIntentFor(Context context, int id, String text, String soundUri) {
        Intent intent = new Intent(context, ReminderTtsReceiver.class);
        if (text != null) {
            intent.putExtra("text", text);
        }
        if (soundUri != null) {
            intent.putExtra("soundUri", soundUri);
        }
        return PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}

package com.hooman.disciplined;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // ReminderTtsPlugin lives directly in this app module rather than as a
    // separate Capacitor plugin package, so it isn't auto-discovered the way
    // node_modules plugins are — it must be registered before super.onCreate
    // runs the bridge's plugin load.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReminderTtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

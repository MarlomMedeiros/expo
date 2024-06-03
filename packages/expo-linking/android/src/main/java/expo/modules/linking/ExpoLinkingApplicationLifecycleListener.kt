package expo.modules.linking

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.content.Intent.getIntent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.ReactActivityLifecycleListener


class ExpoLinkingApplicationLifecycleListener : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    onReceiveURL(activity?.intent?.data)
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    onReceiveURL(intent?.data)
    return true
  }

  private fun onReceiveURL(url: Uri?) {
    if (url == null) {
      return
    }
    ExpoLinkingModule.initialURL = url
    ExpoLinkingModule.onURLReceived?.let { it(url) }
  }
}


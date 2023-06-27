package abi49_0_0.com.swmansion.gesturehandler

import abi49_0_0.com.facebook.react.bridge.ReactContext
import abi49_0_0.com.facebook.react.fabric.FabricUIManager
import abi49_0_0.com.facebook.react.uimanager.UIManagerHelper
import abi49_0_0.com.facebook.react.uimanager.common.UIManagerType
import abi49_0_0.com.facebook.react.uimanager.events.Event

fun ReactContext.dispatchEvent(event: Event<*>) {
  val fabricUIManager = UIManagerHelper.getUIManager(this, UIManagerType.FABRIC) as FabricUIManager
  fabricUIManager.eventDispatcher.dispatchEvent(event)
}

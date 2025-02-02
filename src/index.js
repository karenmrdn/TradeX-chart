import Chart from './core'
import canvas from './renderer/canvas'
import DOM from './utils/DOM'
import EventHub from './utils/eventHub'
import StateMachine from './scaleX/stateMachne'
import Overlay from './components/overlays/overlay'
import Indicator from './components/overlays/indicator'
import { Range, detectInterval } from './model/range'
import { copyDeep, mergeDeep, uid } from './utils/utilities'
import { isPromise } from './utils/typeChecks'
import { talibAPI } from './definitions/talib-api'

// export default Chart
export { 
  Chart, 
  canvas,
  copyDeep, 
  DOM, 
  EventHub,
  StateMachine,
  Indicator,
  talibAPI,
  isPromise,
  mergeDeep, 
  Overlay, 
  Range,
  uid 
}

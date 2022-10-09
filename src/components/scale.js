// scale.js
// Scale bar that lives on the side of the chart

import { isArray, isBoolean, isNumber, isObject, isString } from '../utils/typeChecks'
import DOM from "../utils/DOM"
import yAxis from "./axis/yAxis"
import CEL from "./primitives/canvas"
import { drawTextBG } from "../utils/canvas"
import stateMachineConfig from "../state/state-scale"
import { InputController, } from "../input/controller"
import { copyDeep, uid } from '../utils/utilities'
import { STREAM_UPDATE } from "../definitions/core"
import scalePriceLine from './overlays/scale-priceLine'

import { 
  YAXIS_TYPES,
  BUFFERSIZE
} from "../definitions/chart";

import { YAxisStyle } from "../definitions/style";

/**
 * Provides the chart panes scale / yAxis
 * @export
 * @class ScaleBar
 */
export default class ScaleBar {

  #ID
  #name = "Y Scale Axis"
  #shortName = "scale"
  #mediator
  #options
  #parent
  #core
  #chart
  #target
  #yAxis
  #elScale
  #elScaleCanvas
  #elViewport

  #yAxisType = YAXIS_TYPES[0]  // default, log, percent

  #viewport
  #layerLabels
  #layerOverlays
  #layerPriceLine
  #layerCursor

  #controller
  #priceLine
  #cursorPos

  constructor (mediator, options) {

    this.#mediator = mediator
    this.#options = options
    this.#elScale = mediator.api.elements.elScale
    this.#chart = mediator.api.core.Chart
    this.#parent = mediator.api.parent
    this.#core = this.#mediator.api.core

    this.#options = options
    this.#ID = this.#options.offChartID || uid("TX_scale_")
    this.init()
  }

  log(l) { this.#mediator.log(l) }
  info(i) { this.#mediator.info(i) }
  warning(w) { this.#mediator.warn(w) }
  error(e) { this.#mediator.error(e) }

  get ID() { return this.#ID }
  get name() { return this.#name }
  get shortName() { return this.#shortName }
  get mediator() { return this.#mediator }
  get options() { return this.#options }
  get core() { return this.#core }
  get parent() { return this.#parent }
  set height(h) { this.setHeight(h) }
  get height() { return this.#elScale.clientHeight }
  get width() { return this.#elScale.clientWidth }
  get yAxisHeight() { return this.#yAxis.height }
  get yAxisRatio() { return this.#yAxis.yAxisRatio }
  get layerLabels() { return this.#layerLabels }
  get layerOverlays() { return this.#layerOverlays }
  set yAxisType(t) { this.#yAxisType = YAXIS_TYPES.includes(t) ? t : YAXIS_TYPES[0] }
  get yAxisType() { return this.#yAxisType }
  get yAxisGrads() { return this.#yAxis.yAxisGrads }
  get viewport() { return this.#viewport }
  get pos() { return this.dimensions }
  get dimensions() { return DOM.elementDimPos(this.#elScale) }
  get theme() { return this.#core.theme }
  get config() { return this.#core.config }
  set scaleRange(r) { this.setScaleRange(r) }
  set rangeMode(m) { this.core.range.mode = m }
  get rangeMode() { return this.core.range.mode }
  set rangeYFactor(f) { this.core.range.yFactor = f }

  init() {
    this.mount(this.#elScale)

    this.yAxisType = this.options.yAxisType

    this.log(`${this.#name} instantiated`)
  }


  start(data) {
    this.#yAxis = new yAxis(this, this, this.yAxisType)
    // prepare layered canvas
    this.createViewport()
    // draw the scale
    this.draw()
    // set up event listeners
    this.eventsListen()

    // start State Machine 
    const newConfig = copyDeep(stateMachineConfig)
    newConfig.context.origin = this
    this.mediator.stateMachine = newConfig
    this.mediator.stateMachine.start()
  }

  end() {
    this.#mediator.stateMachine.destroy()
    this.#controller = null
    this.#viewport.destroy()

    this.#controller.removeEventListener("drag", this.onDrag);
    this.#controller.removeEventListener("enddrag", this.onDragDone);

    this.off(`${this.#parent.ID}_mousemove`, this.onMouseMove)
    this.off(`${this.#parent.ID}_mouseout`, this.eraseCursorPrice)
    this.off(STREAM_UPDATE, this.onStreamUpdate)
  }

  eventsListen() {
    let canvas = this.#viewport.scene.canvas
    // create controller and use 'on' method to receive input events 
    this.#controller = new InputController(canvas, {disableContextMenu: false});
    this.#controller.on("drag", this.onDrag.bind(this));
    this.#controller.on("enddrag", this.onDragDone.bind(this));

    this.on(`${this.#parent.ID}_mousemove`, (e) => { this.onMouseMove(e) })
    this.on(`${this.#parent.ID}_mouseout`, (e) => { this.eraseCursorPrice() })
    this.on(STREAM_UPDATE, (e) => { this.onStreamUpdate(e) })
    // this.on("chart_pan", (e) => { this.drawCursorPrice() })
    // this.on("chart_panDone", (e) => { this.drawCursorPrice() })
    // this.on("resizeChart", (dimensions) => this.onResize.bind(this))
  }

  on(topic, handler, context) {
    this.mediator.on(topic, handler, context)
  }

  off(topic, handler) {
    this.mediator.off(topic, handler)
  }

  emit(topic, data) {
    this.mediator.emit(topic, data)
  }

  onResize(dimensions) {
    this.setDimensions(dimensions)
  }

  onMouseMove(e) {
    this.#cursorPos = (isArray(e)) ? e : [Math.floor(e.position.x), Math.floor(e.position.y)]
    this.drawCursorPrice()
  }

  onDrag(e) {
    this.#cursorPos = [
      Math.floor(e.position.x), Math.floor(e.position.y),
      e.dragstart.x, e.dragstart.y,
      e.movement.x, e.movement.y
    ]
    const dragEvent = {
      divider: this,
      cursorPos: this.#cursorPos
    }
    this.emit("scale_drag", dragEvent)
  }

  onDragDone(e) {
    this.#cursorPos = [
      Math.floor(e.position.x), Math.floor(e.position.y),
      e.dragstart.x, e.dragstart.y,
      e.movement.x, e.movement.y
    ]
    const dragEvent = {
      divider: this,
      cursorPos: this.#cursorPos
    }
    this.emit("scale_dragDone", dragEvent)
  }

  onStreamUpdate(e) {

  }

  mount(el) {
    el.innerHTML = this.defaultNode()

    this.#elViewport = el.querySelector(`.viewport`)
  }

  setHeight(h) {
    this.#elScale.style.height = `${h}px`
  }

  setDimensions(dim) {
    const width = this.#elScale.clientWidth
    this.#viewport.setSize(width, dim.h)
    // adjust layers
    this.#layerLabels.setSize(width, dim.h)
    this.#layerOverlays.setSize(width, dim.h)
    this.#layerCursor.setSize(width, dim.h)

    this.setHeight(dim.h)
    this.draw(undefined, true)
  }

  setScaleRange(r) {
    this.rangeMode = "manual"
    this.rangeYFactor = r * 0.001
  }

  defaultNode() {
    const api = this.mediator.api
    const node = `
      <div class="viewport"></div>
    `
    return node
  }

  // -----------------------

  // convert chart price or offchart indicator y data to pixel pos
  yPos(yData) { return this.#yAxis.yPos(yData) }

  // convert pixel pos to chart price
  yPos2Price(y) { return this.#yAxis.yPos2Price(y) }

  nicePrice($) {
    let digits = this.#yAxis.countDigits($)
    return this.#yAxis.limitPrecision(digits)
  }

  // create canvas layers with handling methods
  createViewport() {

    const {layerConfig} = this.layerConfig()

    // create viewport
    this.#viewport = new CEL.Viewport({
      width: this.#elScale.clientWidth,
      height: this.#elScale.clientHeight,
      container: this.#elViewport
    });

    // create layers - labels, overlays, cursor
    this.#layerLabels = new CEL.Layer(layerConfig);
    this.#layerOverlays = new CEL.Layer(layerConfig);
    this.#layerCursor = new CEL.Layer();

    // add layers
    this.#viewport
          .addLayer(this.#layerLabels);
    if (isObject(this.config.stream)) 
          this.layerStream()
    this.#viewport
          .addLayer(this.#layerOverlays)
          .addLayer(this.#layerCursor);
  }

  layerConfig() {
    const width = this.#elScale.clientWidth
    const height = this.#elScale.clientHeight
    const layerConfig = { 
      width: width, 
      height: height
    }
    return {width, height, layerConfig}
  }

  layerStream() {
    // if the layer and instance were no set, do it now
    if (!this.#layerPriceLine) {
      const {layerConfig} = this.layerConfig()
      this.#layerPriceLine = new CEL.Layer(layerConfig);
      this.#viewport.addLayer(this.#layerPriceLine)
    }
    if (!this.#priceLine) {
      this.#priceLine =
      new scalePriceLine(
        this.#layerPriceLine,
        this,
        this.theme
      )
    }
  }

  draw() {
    this.#yAxis.draw()
    this.#viewport.render()
  }

  drawCursorPrice() {
    let [x, y] = this.#cursorPos,
        price =  this.yPos2Price(y),
        nice = this.nicePrice(price),

        options = {
          fontSize: YAxisStyle.FONTSIZE * 1.05,
          fontWeight: YAxisStyle.FONTWEIGHT,
          fontFamily: YAxisStyle.FONTFAMILY,
          txtCol: YAxisStyle.COLOUR_CURSOR,
          bakCol: YAxisStyle.COLOUR_CURSOR_BG,
          paddingTop: 2,
          paddingBottom: 2,
          paddingLeft: 3,
          paddingRight: 3
        },
        
        height = options.fontSize + options.paddingTop + options.paddingBottom,
        yPos = y - (height * 0.5);

    this.#layerCursor.scene.clear()
    const ctx = this.#layerCursor.scene.context
    ctx.save()

    ctx.fillStyle = options.bakCol
    ctx.fillRect(1, yPos, this.width, height)

    drawTextBG(ctx, `${nice}`, 1, yPos , options)

    ctx.restore()
    this.#viewport.render()
  }

  eraseCursorPrice() {
    this.#layerCursor.scene.clear()
    this.#viewport.render()
    return
  }

  resize(width=this.width, height=this.height) {
    // adjust partent element
    this.setDimensions({w: width, h: height})
    // // adjust layers
    // width -= this.#elScale.clientWidth
    // this.#layerCursor.setSize(width, height)
    // // adjust width for scroll buffer
    // const buffer = this.config.buffer || BUFFERSIZE
    //       width = Math.round(width * ((100 + buffer) * 0.01))
    // this.#layerLabels.setSize(width, height)
    // this.#layerOverlays.setSize(width, height)
    // // render
    // this.draw(undefined, true)
  }

}

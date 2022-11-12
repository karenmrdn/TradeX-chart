// chart.js
// Chart - where most of the magic happens
// Providing: the playground for price movements, indicators and drawing tools

import DOM from "../utils/DOM"
import { isArray, isBoolean, isNumber, isObject, isString } from '../utils/typeChecks'
import ScaleBar from "./scale"
import Graph from "./graph"
import CEL from "../components/primitives/canvas"
import Legends from "./primitives/legend"
import chartGrid from "./overlays/chart-grid"
import chartVolume from "./overlays/chart-volume"
import chartCandles from "./overlays/chart-candles"
import chartStreamCandle from "./overlays/chart-streamCandle"
import chartCursor from "./overlays/chart-cursor"
import indicator from "./overlays/inidcator"
import OnChart from "./overlays"
import stateMachineConfig from "../state/state-chart"
import { InputController, Keys } from "../input/controller"
import { CandleStyle, VolumeStyle } from "../definitions/style"
import {
  STREAM_ERROR,
  STREAM_NONE,
  STREAM_LISTENING,
  STREAM_STOPPED,
  STREAM_NEWVALUE,
  STREAM_UPDATE
} from "../definitions/core"

import {
  NAME,
  ID,
  CLASS_DEFAULT,
  CLASS_UTILS ,
  CLASS_BODY,
  CLASS_WIDGETSG,
  CLASS_TOOLS,
  CLASS_MAIN,
  CLASS_TIME,
  CLASS_ROWS,
  CLASS_ROW,
  CLASS_CHART,
  CLASS_SCALE,
  CLASS_WIDGETS,
  CLASS_ONCHART,
  CLASS_OFFCHART,
} from '../definitions/core'

import {
  BUFFERSIZE,
} from "../definitions/chart"

const STYLE_CHART = "" // "position: absolute; top: 0; left: 0; border: 1px solid; border-top: none; border-bottom: none;"
const STYLE_SCALE = "position: absolute; top: 0; right: 0; border-left: 1px solid;"
const STYLE_SCALE2 = "top: 0; right: 0; border-left: 1px solid;"

const defaultOverlays = [
  ["grid", {class: chartGrid, fixed: true, required: true, params: {axes: "y"}}],
  ["volume", {class: chartVolume, fixed: false, required: true, params: {maxVolumeH: VolumeStyle.ONCHART_VOLUME_HEIGHT}}],
  ["candles", {class: chartCandles, fixed: false, required: true}],
  ["stream", {class: chartStreamCandle, fixed: false, required: true}],
  ["cursor", {class: chartCursor, fixed: true, required: true}]
]


export default class Chart {

  #name = "Chart"
  #shortName = "chart"
  #mediator
  #options
  #core
  #parent

  #elChart
  #elCanvas
  #elViewport
  #elLegends
  #elScale

  #Scale
  #Time
  #Graph
  #Legends
  #onChart
  #Stream

  #chartXPadding = 5
  #chartYPadding = 2.5

  #yAxisDigits
  #pricePrecision
  #volumePrecision

  #viewport
  #layerGrid
  #layerVolume
  #layerCandles
  #layerStream
  #layerCursor
  #layersOnChart
  #layersTools = new Map()
  #layerWidth
  
  #chartGrid
  #chartVolume
  #chartIndicators = new Map()
  #chartCandles
  #chartStreamCandle
  #chartTools = new Map()
  #chartCursor

  #cursorPos = [0, 0]
  #cursorActive = false
  #cursorClick

  #settings
  #streamCandle
  #title
  #theme
  #controller


  constructor (mediator, options) {

    this.#mediator = mediator
    this.#elChart = mediator.api.elements.elChart
    this.#elScale = mediator.api.elements.elChartScale
    this.#parent = {...this.#mediator.api.parent}
    this.#core = this.#mediator.api.core
    this.#theme = this.#core.theme
    this.#onChart = this.#mediator.api.onChart

    this.#settings = this.#mediator.api.settings
    this.#options = options
    this.init(options)
  }

  log(l) { this.#mediator.log(l) }
  info(i) { this.#mediator.info(i) }
  warning(w) { this.#mediator.warn(w) }
  error(e) { this.#mediator.error(e) }

  get ID() { return "chart" }
  get name() {return this.#name}
  get shortName() { return this.#shortName }
  get mediator() { return this.#mediator }
  get options() { return this.#options }
  get element() { return this.#elChart }
  get core() { return this.#core }
  get time() { return this.#Time }
  get scale() { return this.#Scale }
  get elScale() { return this.#elScale }
  set width(w) { this.setWidth(w) }
  get width() { return this.#elChart.clientWidth }
  set height(h) { this.setHeight(h) }
  get height() { return this.#elChart.clientHeight }
  get pos() { return this.dimensions }
  get dimensions() { return DOM.elementDimPos(this.#elChart) }
  get stateMachine() { return this.#mediator.stateMachine }
  set state(s) { this.#core.setState(s) }
  get state() { return this.#core.getState() }
  get data() { return this.#core.chartData }
  get range() { return this.#core.range }
  get stream() { return this.#Stream }
  get streamCandle() { return this.#streamCandle }
  get onChart() { return this.#onChart }
  set priceDigits(digits) { this.setYAxisDigits(digits) }
  get priceDigits() { return this.#yAxisDigits || PRICEDIGITS }
  get cursorPos() { return this.#cursorPos }
  get cursorActive() { return this.#cursorActive }
  get cursorClick() { return this.#cursorClick }
  get candleW() { return this.#core.Timeline.candleW }
  get theme() { return this.#core.theme }
  get config() { return this.#core.config }
  get scrollPos() { return this.#core.scrollPos }
  get bufferPx() { return this.#core.bufferPx }
  set layerWidth(w) { this.#layerWidth = w }
  get layerWidth() { return this.#layerWidth }
  get axes() { return "x" }

  init(options) {

    // process options
    if (isObject(options)) {
      for (const option in options) {
        if (option in this.props()) {
          this.props()[option](options[option])
        }
      }
    }

    // mount chart on DOM
    this.mount(this.#elChart)

    // Legends - to display indicator overlay Title, inputs and options
    let chartLegend = {
      id: "chart",
      title: this.#title,
      type: "chart"
    }
    this.#Legends = new Legends(this.#elLegends, this)
    this.#Legends.add(chartLegend)

    // api - functions / methods, calculated properties provided by this module
    const api = {...this.#mediator.api}
    api.parent = this
    api.chart = this
    api.elements = 
    {...api.elements, 
      ...{
        elScale: this.#elScale
      }
    }
    api.onChart = this.#mediator.api.onChart
    api.legends = this.#Legends

    // Y Axis - Price Scale
    options.yAxisType = "default"
    this.#Scale = this.#mediator.register("Chart_ScaleBar", ScaleBar, options, api)


    // onChart indicators
    // this.#onChart = this.#mediator.register("OnChart", OnChart, options, api)

    this.log(`${this.#name} instantiated`)
  }

  /**
   * Start chart and dependent components event listening. 
   * Start the chart state machine
   * Draw the chart
   */
  start() {

    // X Axis - Timeline
    this.#Time = this.mediator.api.Timeline

    let overlays = new Map(defaultOverlays)

    if (overlays.has("volume")) {
      const volume = overlays.get("volume")
      volume.params.maxVolumeH = this.#theme?.volume?.Height || VolumeStyle.ONCHART_VOLUME_HEIGHT
      overlays.set("volume", volume)
    }

    // add the chart overlays
    // overlays = [
    //   defaultOverlays[0], 
    //   ...overlays,
    //   defaultOverlays[1]
    // ]

    overlays = Array.from(overlays)

    this.#Graph = new Graph(this, this.#elViewport, overlays)
    this.#layerStream = this.#Graph.overlays.get("stream").layer
    this.#chartStreamCandle = this.#Graph.overlays.get("stream").instance
    this.#layerGrid = this.#Graph.overlays.get("grid").layer
    this.#chartGrid = this.#Graph.overlays.get("grid").instance
    this.#elCanvas = this.#Graph.viewport.scene.canvas

    // start on chart indicators

    const data = {inputs: {}}
    if (isObject(this.Stream)) {
      data.inputs.chart = {stream: this.Stream}
      // iterate over on chart indicators and add inputs if any
    }

    // Y Axis - Price Scale
    this.#Scale.start(`Chart says to Scale, "Thanks for the update!"`)

    // prepare layered canvas
    // this.createViewport()
    // draw the chart - grid, candles, volume
    this.draw(this.range)

    // set mouse pointer
    this.setCursor("crosshair")

    // set up event listeners
    this.eventsListen()

    // start State Machine 
    stateMachineConfig.context.origin = this
    this.#mediator.stateMachine = stateMachineConfig
    this.#mediator.stateMachine.start()
  }

  end() {
    this.#mediator.stateMachine.destroy()
    this.#Scale.end()
    this.#viewport.destroy()

    this.#controller.removeEventListener("mousemove", this.onMouseMove);
    this.#controller.removeEventListener("mouseenter", this.onMouseEnter);
    this.#controller.removeEventListener("mouseout", this.onMouseOut);
    this.#controller.removeEventListener("mousedown", this.onMouseDown);
    this.#controller = null

    this.off("main_mousemove", this.onMouseMove)
  }


  eventsListen() {
    // create controller and use 'on' method to receive input events 
    this.#controller = new InputController(this.#elCanvas, {disableContextMenu: false});
    this.#controller.on("mousemove", this.onMouseMove.bind(this));
    this.#controller.on("mouseenter", this.onMouseEnter.bind(this));
    this.#controller.on("mouseout", this.onMouseOut.bind(this));
    this.#controller.on("mousedown", this.onMouseDown.bind(this));

    // listen/subscribe/watch for parent notifications
    this.on("main_mousemove", (pos) => this.updateLegends(pos))
    this.on(STREAM_LISTENING, (stream) => this.onStreamListening(stream))
    this.on(STREAM_NEWVALUE, (candle) => this.onStreamNewValue(candle))
    this.on(STREAM_UPDATE, (candle) => this.onStreamUpdate(candle))
    this.on("chart_yAxisRedraw", this.onYAxisRedraw.bind(this))
  }

  /**
   * Set a custom event listener
   * @param {string} topic 
   * @param {function} handler 
   * @param {*} context 
   */
  on(topic, handler, context) {
    this.#mediator.on(topic, handler, context)
  }

  /**
   * Remove a custom event listener
   * @param {string} topic 
   * @param {function} handler 
   */
  off(topic, handler) {
    this.#mediator.off(topic, handler)
  }

  /**
   * Emit an event with optional data
   * @param {string} topic 
   * @param {*} data 
   */
  emit(topic, data) {
    this.#mediator.emit(topic, data)
  }

  onMouseMove(e) {
    this.#cursorPos = [Math.floor(e.position.x), Math.floor(e.position.y)]
    this.emit("chart_mousemove", this.#cursorPos)
    this.updateLegends()
  }

  onMouseEnter(e) {
    this.#cursorActive = true
    this.#cursorPos = [Math.floor(e.position.x), Math.floor(e.position.y)]
    this.emit(`${this.ID}_mouseenter`, this.#cursorPos)
  }

  onMouseOut(e) {
    this.#cursorActive = false
    this.#cursorPos = [Math.floor(e.position.x), Math.floor(e.position.y)]
    this.emit(`${this.ID}_mouseout`, this.#cursorPos)
  }

  onMouseDown(e) {
    this.#cursorClick = [Math.floor(e.position.x), Math.floor(e.position.y)]
    if (this.stateMachine.state === "tool_activated") this.emit("tool_targetSelected", {target: this, position: e})
  }

  onStreamListening(stream) {
    if (this.#Stream !== stream) {
      this.#Stream = stream
    }
  }

  onStreamNewValue(candle) {
    this.draw(this.range, true)
  }

  onStreamUpdate(candle) {
    this.#streamCandle = candle
    this.#layerStream.setPosition(this.#core.stream.lastScrollPos, 0)
    this.#chartStreamCandle.draw(candle)
    this.#Graph.render()
    this.updateLegends(this.#cursorPos, candle)
  }

  onYAxisRedraw() {
    this.#Scale.draw()
    this.draw(this.range, true)
  }

  mount(el) {
    el.innerHTML = this.defaultNode()

    const api = this.#mediator.api
    this.#elViewport = DOM.findBySelector(`#${api.id} .${CLASS_CHART} .viewport`)
    this.#elLegends = DOM.findBySelector(`#${api.id} .${CLASS_CHART} .legends`)
  }

  props() {
    return {
      // id: (id) => this.setID(id),
      title: (title) => this.#title = title,
      yAxisDigits: (digits) => this.setYAxisDigits(digits),
    }
  }

  setWidth(w) {
    if (!isNumber(w)) w = this.width || this.#parent.width

    this.#elChart.style.width = `${w}px`
    this.#elViewport.style.width = `${w - this.#elScale.clientWidth}px`
  }

  setHeight(h) {
    if (!isNumber(h)) h = this.height || this.#parent.height

    this.#elChart.style.height = `${h}px`
    this.#elScale.style.height = `${h}px`
    this.#elViewport.style.height = `${h}px`
    this.#Scale.setDimensions({w: null, h: h})
  }

  /**
   * Set chart dimensions
   * @param {object} dim - dimensions {w:width, h: height}
   */
  setDimensions(dim) {
    const buffer = this.config.buffer || BUFFERSIZE
    const width = dim.w - this.#elScale.clientWidth
    const height = dim.h
    this.layerWidth = Math.round(width * ((100 + buffer) * 0.01))

    this.#viewport.setSize(width, height)
    this.#layerGrid.setSize(this.layerWidth, height)
    this.#layerVolume.setSize(this.layerWidth, height)
    // TODO: iterate layersOnChart and setSize()
    // this.#layersOnChart.setSize(this.layerWidth, height)
    this.#layerCandles.setSize(this.layerWidth, height)
    if (this.#Stream) this.#layerStream.setSize(this.layerWidth, height)
    this.#layerCursor.setSize(width, height)

    this.setWidth(dim.w)
    this.setHeight(dim.h)
    this.#Scale.resize(dim.w, dim.h)

    this.draw(undefined, true)
  }

  setYAxisDigits(digits) {
    this.#yAxisDigits = (isNumber(digits) && digits >= 3) ? parseInt(digits) : PRICEDIGITS
  }
  getPriceDigits() {
    return this.#yAxisDigits
  }

  setCursor(cursor) {
    this.#elChart.style.cursor = cursor
  }

  defaultNode() {
    const api = this.#mediator.api
    const rowsH = api.height - api.utilsW - api.timeH
    const width = api.width - api.toolsW - api.scaleW
    const height = this.#options.chartH || rowsH - 1

    const styleChart = STYLE_CHART + ` width: ${width}px; height: ${height}px`
    const styleScale = STYLE_SCALE + ` width: ${api.scaleW - 1}px; height: ${height}px; border-color: ${api.chartBorderColour};`
    const styleLegend = `width: 100%; position: absolute; top: 0; left: 0; z-index:100;`

    const node = `
      <div class="viewport" style="${styleChart}"></div>
      <div class="legends" style="${styleLegend}"></div>
      <div class="${CLASS_SCALE}" style="${styleScale}"></div>
    `
    this.#elScale.style.cssText = STYLE_SCALE2 + ` width: ${api.scaleW - 1}px; height: ${height}px; border-color: ${api.chartBorderColour};`
    return node
  }


// -----------------------

  setTimezone(timezone) {}
  getTimezone(timezone) {}
  // setChartStyle(chartStyle) {}
  // getChartStyle(chartStyle) {}
  // setChartTheme(chartTheme) {}
  // getChartTheme(chartTheme) {}

  loadData(data) {}
  updateData(data) {}

  createViewport() {}

  layerConfig() {
    const buffer = this.config.buffer || BUFFERSIZE
    const width = this.#elViewport.clientWidth
    const height = this.#options.chartH || this.#parent.rowsH - 1
    this.layerWidth = Math.round(width * ((100 + buffer) * 0.01))
    const layerConfig = { 
      width: this.layerWidth, 
      height: height
    }
    return {width, height, layerConfig}
  }

  layersOnChart() {
    let l = []
    let { layerConfig } = this.layerConfig()

    for (let i = 0; i < this.#onChart.length; i++) {
      l[i] = new CEL.Layer(layerConfig)
    }
    return l
  }

  addLayersOnChart() {
    for (let i = 0; i < this.#layersOnChart.length; i++) {
      this.#viewport.addLayer(this.#layersOnChart[i])
    }
  }

  chartIndicators() {
    const indicators = []
    for (let i = 0; i < this.#layersOnChart.length; i++) {
      indicators[i] = 
        new indicator(
          this.#layersOnChart[i], 
          this.#Time,
          this.#Scale,
          this.config)
    } 
    return indicators
  }

  layersTools() {

  }

  addTool(tool) {
    let { layerConfig } = this.layerConfig()
    let layer = new CEL.Layer(layerConfig)
    this.#layersTools.set(tool.id, layer)
    this.#viewport.addLayer(layer)

    tool.layerTool = layer
    this.#chartTools.set(tool.id, tool)
  }

  addTools(tools) {

  }

  chartTools() {
    const tools = []
    // for (let i = 0; i < this.#layersTools.length; i++) {
      // tools[i] = 
        // new indicator(
        //   this.#layersOnChart[i], 
        //   this.#Time,
        //   this.#Scale,
        //   this.config)
    // } 
    // return tools
  }

  chartToolAdd(tool) {
    // create new tool layer

    this.#chartTools.set(tool.id, tool)
  }

  chartToolDelete(tool) {
    this.#chartTools.delete(tool)
  }

  draw(range=this.range, update=false) {
    this.#Graph.draw(range, update)
  }

  drawGrid() {
    this.#layerGrid.setPosition(this.#core.scrollPos, 0)
    this.#chartGrid.draw(true, "y")
    this.#Graph.render();
  }

  drawStream(candle) {

  }
  
  /**
   * Refresh the entire chart
   */
  refresh() {
    this.#Scale.draw()
    this.draw(this.range, true)
  }

  /**
   * Return the screen x position for a give time stamp
   * @param {number} time - timestamp
   * @returns {number} - x position on canvas
   */
  time2XPos(time) {
    return this.#Time.xPos(time)
  }

  /**
   * 
   * @param {number} price 
   * @returns {number} - y position on canvas
   */
  price2YPos(price) {
    return this.#Scale.yPos(price)
  }

  /**
   * Set the price accuracy
   * @param {number} pricePrecision - Price accuracy
   */
  setPriceVolumePrecision (pricePrecision) {
    if (!isNumber(pricePrecision) || pricePrecision < 0) {
      this.warning('setPriceVolumePrecision', 'pricePrecision', 'pricePrecision must be a number and greater than zero!!!')
      return
    }
    this.#pricePrecision = pricePrecision
  }

  /**
   * Set the volume accuracy
   * @param {number}volumePrecision - Volume accuracy
   */
  setPriceVolumePrecision (volumePrecision) {
    if (!isNumber(volumePrecision) || volumePrecision < 0) {
      logWarn('setPriceVolumePrecision', 'volumePrecision', 'volumePrecision must be a number and greater than zero!!!')
      return
    }
    this.#volumePrecision = volumePrecision
  }

  /**
   * Update chart and indicator legends
   * @param {array} pos - cursor position x, y, defaults to current cursor position
   * @param {array} candle - OHLCV
   */
  updateLegends(pos=this.#cursorPos, candle=false) {

    const legends = this.#Legends.list
    const inputs = {}
      let ohlcv = this.#Time.xPosOHLCV(pos[0])
      let colours = []

    if (this.#Stream && ohlcv[4] === null) ohlcv = candle

    // TODO: get candle colours from config / theme
    if (ohlcv[4] >= ohlcv[1]) colours = new Array(5).fill(this.theme.candle.UpWickColour)
    else colours = new Array(5).fill(this.theme.candle.DnWickColour)

    inputs.O = this.#Scale.nicePrice(ohlcv[1])
    inputs.H = this.#Scale.nicePrice(ohlcv[2])
    inputs.L = this.#Scale.nicePrice(ohlcv[3])
    inputs.C = this.#Scale.nicePrice(ohlcv[4])
    inputs.V = this.#Scale.nicePrice(ohlcv[5])

    for (const legend in legends) {
      this.#Legends.update(legend, {inputs: inputs, colours: colours})
    }
  }

  /**
   * Calculate new range index / position 
   * @param {array} pos - [x2, y2, x1, y1, xdelta, ydelta]
   */
  updateRange(pos) {
    // draw the chart - grid, candles, volume
    this.draw(this.range)
  }

  /**
   * Zoom (contract or expand) range start
   * emits: "chart_zoomDone"
   * @param {array} data - [newStart, newEnd, oldStart, oldEnd, inOut]
   */
  zoomRange(data) {

    // this.#core.setRange(data[0], data[1])

    // draw the chart - grid, candles, volume
    this.draw(this.range, true)
    this.emit("chart_zoomDone")
  }

  /**
   * Set the entire chart dimensions, this will cascade and resize components
   * @param {number} width - width in pixels, defaults to current width
   * @param {number} height - height in pixels, defaults to current height
   */
  resize(width=this.width, height=this.height) {
    // adjust element, viewport and layers
    this.setDimensions({w: width, h: height})
  }
}

// main.js
// Main Pane that holds the chart and off chart indicators
// Providing: chart, off chart indicators

import DOM from "../utils/DOM"
import Timeline from './timeline'
import CEL from "../components/primitives/canvas"
import Chart from "./onChart"
import OffChart from "./offChart"
import chartGrid from "./overlays/chart-grid"
import stateMachineConfig from "../state/state-mainPane"
import { InputController, Keys } from "../input/controller"
import { isNumber } from "../utils/typeChecks"
import { debounce, throttle } from "../utils/utilities"

import {
  CLASS_TIME,
  CLASS_ROWS,
  CLASS_ROW,
  CLASS_GRID,
  CLASS_CHART,
  CLASS_YAXIS,
  STREAM_NEWVALUE
} from '../definitions/core'

import {
  PRICEDIGITS,
  XAXIS_ZOOM,
  BUFFERSIZE,
  ROWMINHEIGHT,
  OFFCHARTDEFAULTHEIGHT,
} from "../definitions/chart"


const STYLE_ROWS = "width:100%; min-width:100%;"
const STYLE_ROW = "position: relative; overflow: hidden;"
const STYLE_TIME = "border-top: 1px solid; width:100%; min-width:100%;"
const STYLE_SCALE = "border-left: 1px solid;"


/**
 * Provides chart main pane that hosts, chart, off charts (indicators), timeline, widgets
 * @export
 * @class MainPane
 */
export default class MainPane {

  #name = "Utilities"
  #shortName = "Main"
  #mediator
  #options
  #parent
  #core
  #elYAxis
  #elMain
  #elRows
  #elTime
  #elChart
  #elChartScale
  #elOffCharts = []
  #elYAxisScales = []
  #elGrid
  #elCanvas
  #elViewport

  #viewport
  #layerGrid
  #layerLabels
  #OffCharts = new Map()
  #Chart
  #Time
  #chartGrid

  #offChartDefaultH = OFFCHARTDEFAULTHEIGHT // %
  #offChartDefaultWpx = 120
  #rowMinH = ROWMINHEIGHT // px

  #cursorPos = [0, 0]
  #drag = {
    active: false,
    start: [0,0],
    prev: [0,0],
    delta: [0,0]
  }
  #buffer
  
  #indicators
  #controller

  constructor (mediator, options) {

    this.#mediator = mediator
    this.#options = options
    this.#parent = {...this.#mediator.api.parent}
    this.#core = this.#mediator.api.core
    this.#elMain = this.#core.elMain
    this.#elYAxis = this.#core.elYAxis
    this.init(options)
  }

  log(l) { this.#mediator.log(l) }
  info(i) { this.#mediator.info(i) }
  warning(w) { this.#mediator.warn(w) }
  error(e) { this.#mediator.error(e) }

  get name() { return this.#name }
  get shortName() { return this.#shortName }
  get mediator() { return this.#mediator }
  get core() { return this.#core }
  get chart() { return this.#Chart }
  get time() { return this.#Time }
  get offCharts() { return this.#OffCharts }
  get options() { return this.#options }
  get width() { return this.#elMain.clientWidth }
  get height() { return this.#elMain.clientHeight }
  get chartW() { return this.#elChart.clientWidth }
  get chartH() { return this.#elChart.clientHeight }
  get rowsW() { return this.#elRows.clientWidth }
  get rowsH() { return this.#elRows.clientHeight }
  get rowMinH() { return this.#rowMinH }
  set rowMinH(h) { if (isNumber(h)) this.#rowMinH = Math.abs(h) }
  get pos() { return this.dimensions }
  get dimensions() { return DOM.elementDimPos(this.#elMain) }
  get range() { return this.#core.range }
  get cursorPos() { return this.#cursorPos }
  get candleW() { return this.#Time.candleW }
  get theme() { return this.#core.theme }
  get config() { return this.#core.config }
  get buffer() { return this.#buffer }
  get bufferPx() { return this.getBufferPx() }
  get scrollPos() { return this.#core.scrollPos }


  init(options) {
    this.mount(this.#elMain)

    this.#indicators = this.#core.indicators

    const api = this.#mediator.api

    this.#elRows = DOM.findBySelector(`#${api.id} .${CLASS_ROWS}`)
    this.#elTime = DOM.findBySelector(`#${api.id} .${CLASS_TIME}`)
    this.#elChart = DOM.findBySelector(`#${api.id} .${CLASS_CHART}`)
    this.#elGrid = DOM.findBySelector(`#${api.id} tradex-grid`)
    this.#elViewport = this.#elGrid.viewport // DOM.findBySelector(`#${api.id} .${CLASS_GRID} .viewport`)
    this.#elChartScale  = DOM.findBySelector(`#${api.id} .${CLASS_YAXIS} .${CLASS_CHART}`)

    api.parent = this
    api.chartData = this.mediator.api.chartData
    api.onChart = this.#mediator.api.onChart
    api.offChart = this.#mediator.api.offChart
    api.rangeLimit = this.#mediator.api.rangeLimit
    api.settings = this.#mediator.api.settings

    // api - functions / methods, calculated properties provided by this module
    api.elements = 
      {...api.elements, 
        ...{
          elChart: this.#elChart,
          elTime: this.#elTime,
          elRows: this.#elRows,
          elOffCharts: this.#elOffCharts,
          elChartScale: this.#elChartScale
        }
      }

    // register timeline - xAxis
    this.#Time = this.#mediator.register("Timeline", Timeline, options, api)
    // register offChart
    this.registerOffCharts(options, api)
    // register chart
    this.#Chart = this.#mediator.register("Chart", Chart, options, api)

    this.#buffer = isNumber(this.config.buffer)? this.config.buffer : BUFFERSIZE
    this.#rowMinH = isNumber(this.config.rowMinH)? this.config.rowMinH : ROWMINHEIGHT
    this.#offChartDefaultH = isNumber(this.config.offChartDefaultH)? this.config.offChartDefaultH : OFFCHARTDEFAULTHEIGHT

    this.log(`${this.#name} instantiated`)
  }

  start() {
    let i = 0

    this.#Time.start()
    this.#Chart.start()
    this.#OffCharts.forEach((offChart, key) => {
      offChart.start(i++)
    })

    // prepare layered canvas
    this.createViewport()
    // draw the chart - grid, candles, volume
    this.initXGrid()

    // set up event listeners
    this.eventsListen()

    // start State Machine 
    stateMachineConfig.context.origin = this
    this.#mediator.stateMachine = stateMachineConfig
    this.#mediator.stateMachine.start()
  }

  end() {
    this.#mediator.stateMachine.destroy()
    this.#Time.end()
    this.#Chart.end()
    this.#OffCharts.forEach((offChart, key) => {
      offChart.end()
    })
    this.#viewport.destroy()

    this.#controller.removeEventListener("mousewheel", this.onMouseWheel);
    this.#controller.removeEventListener("mousemove", this.onMouseMove);
    this.#controller.removeEventListener("drag", this.onChartDrag);
    this.#controller.removeEventListener("enddrag", this.onChartDragDone);
    this.#controller.removeEventListener("keydown", this.onChartKeyDown)
    this.#controller.removeEventListener("keyup", this.onChartKeyDown)
    this.#controller = null

    this.off(STREAM_NEWVALUE, this.onNewStreamValue)
  }


  eventsListen() {
    // Give Main focus so it can receive keyboard input
    this.#elMain.tabIndex = 0
    this.#elMain.focus()

    // create controller and use 'on' method to receive input events 
    this.#controller = new InputController(this.#elRows, {disableContextMenu: false});

    this.#controller.on("mousewheel", this.onMouseWheel.bind(this))
    this.#controller.on("mousemove", this.onMouseMove.bind(this));
    // this.#controller.on("drag", debounce(this.onChartDrag, 1, this, true));
    this.#controller.on("drag", throttle(this.onChartDrag, 100, this, true));
    // this.#controller.on("drag", this.onChartDrag.bind(this));

    this.#controller.on("enddrag", this.onChartDragDone.bind(this));
    this.#controller.on("keydown", this.onChartKeyDown.bind(this))
    this.#controller.on("keyup", this.onChartKeyUp.bind(this))

    this.#controller.on("mouseup", this.onMouseUp.bind(this))

    // listen/subscribe/watch for parent notifications
    this.on(STREAM_NEWVALUE, this.onNewStreamValue.bind(this))
    // this.on("chart_zoom", this.draw.bind(this))
  }

  on(topic, handler, context) {
    this.#mediator.on(topic, handler, context)
  }

  off(topic, handler) {
    this.#mediator.off(topic, handler)
  }

  emit(topic, data) {
    this.#mediator.emit(topic, data)
  }

  onMouseWheel(e) {
    e.domEvent.preventDefault()

    const direction = Math.sign(e.wheeldelta) * -1
    const range = this.range
    const newStart = range.indexStart - Math.floor(direction * XAXIS_ZOOM * range.Length)
    const newEnd = range.indexEnd + Math.floor(direction * XAXIS_ZOOM * range.Length)

    this.#core.setRange(newStart, newEnd)
    this.draw()
  }
  
  onMouseMove(e) {
    this.#cursorPos = [
      e.position.x, e.position.y, 
      e.dragstart.x, e.dragstart.y,
      e.movement.x, e.movement.y
    ]

    this.emit("main_mousemove", this.#cursorPos)
  }

  onMouseUp(e) {
    this.emit("main_mouseup", e)
  }

  onChartDrag(e) {
    const d = this.#drag
    if (!d.active) {
      d.active = true
      d.start = [e.dragstart.x, e.dragstart.y]
      d.prev = d.start
      d.delta = [e.movement.x, e.movement.y]
    }
    else {
      d.delta = [
        e.position.x - d.prev[0], 
        e.position.y - d.prev[1]
      ]
      d.prev = [
        e.position.x, 
        e.position.y
      ]
    }

    this.#cursorPos = ("n",[
      e.position.x, e.position.y, 
      ...d.start,
      ...d.delta
    ])

    // this.#cursorPos = [
    //   e.position.x, e.position.y, 
    //   e.dragstart.x, e.dragstart.y,
    //   e.movement.x, e.movement.y
    // ]
    this.emit("chart_pan", this.#cursorPos)
    // draw() called via state machine updateRange()
    // this.draw()
  }

  onChartDragDone(e) {
    const d = this.#drag
    d.active = false
    d.delta = [
      e.position.x - d.prev[0], 
      e.position.y - d.prev[1]
    ]
    this.#cursorPos = [
      e.position.x, e.position.y, 
      ...d.start,
      ...d.delta
    ]

    // this.#cursorPos = [
    //   e.position.x, e.position.y, 
    //   e.dragstart.x, e.dragstart.y,
    //   e.movement.x, e.movement.y
    // ]
    this.emit("chart_panDone", this.#cursorPos)
    // draw() called via state machine updateRange()
    // this.draw()
  }

  onChartKeyDown(e) {
    let step = (this.candleW > 1) ? this.candleW : 1

    switch (e.keyCode) {
      case Keys.Left:
        this.emit("chart_pan", [0,null,step,null,step * -1,null])
        break;
      case Keys.Right:
        this.emit("chart_pan", [step,null,0,null,step,null])
        break;
    }
    // this.draw()
  }

  onChartKeyUp(e) {
    let step = (this.candleW > 1) ? this.candleW : 1

    switch (e.keyCode) {
      case Keys.Left:
        this.emit("chart_panDone", [0,null,step,null,step * -1,null])
        break;
      case Keys.Right:
        this.emit("chart_panDone", [step,null,0,null,step,null])
        break;
    }
    // this.draw()
  }

  onNewStreamValue(value) {
    this.draw()
  }

  mount(el) {
    el.innerHTML = this.defaultNode()
  }

  setWidth(w) {
    const resize = this.rowsW / w
    const rows = this.#elRows.children
    /*
    for (let row of rows) {
      row.style.width = `${Math.round(row.clientWidth * resize)}px`
    }
    */
    this.#elRows.style.width = `${Math.round(w * resize)}px`
  }

  setHeight(h) {
    const api = this.#mediator.api
    const resize = this.rowsH / (h - api.timeH)
    const rows = this.#elRows.children
    /*
    for (let row of rows) {
      row.style.height = `${Math.round(row.style.height * resize)}px`
    }
    */
    this.#elRows.style.height = `${Math.round(this.#elRows.style.height * resize)}px`
  }

  setDimensions(dimensions) {

    let height = dimensions.mainH - this.#Time.height
    let oldHeight = this.height
    let chartW = dimensions.mainW
    let chartH = Math.round(this.#Chart.height * dimensions.resizeH) - this.time.height
    let width = chartW - this.#Chart.scale.width

    this.setWidth(dimensions.mainW)
    this.setHeight(dimensions.mainH)

    this.#core.scrollPos = -1

    this.#Time.setDimensions({w: dimensions.mainW})
    // this.#Time.draw()

    this.#elGrid.style.height = `${height}px`
    this.#elGrid.style.width = `${width}px`
    this.#elViewport.style.height = `${height}px`
    this.#elViewport.style.width = `${width}px`
    this.#viewport.setSize(width, height)

    const buffer = this.buffer
    width = Math.round(width * ((100 + buffer) * 0.01))
    this.#layerGrid.setSize(width, height)
    this.#chartGrid.draw("x")
    this.#viewport.render();

    this.#Chart.resize(chartW, chartH)

    this.#OffCharts.forEach((offChart, key) => {
      chartH = Math.round(offChart.height * dimensions.resizeH) //- this.time.height
      offChart.resize(chartW, chartH)
      offChart.Divider.setDividerPos()
    })

    this.#core.range

    dimensions.rowsW = this.rowsW
    dimensions.rowsH = this.rowsH

    this.emit("rowsResize", dimensions)
  }

  getBufferPx() { 
    let w = Math.round(this.width * this.buffer / 100) 
    let r = w % this.candleW
    return w - Math.round(r)
  }

  registerOffCharts(options, api) {
    
    let a = this.#offChartDefaultH * this.#mediator.api.offChart.length,
        offChartsH = Math.round( a / Math.log10( a * 2 ) ) / 100,
        rowsH = this.rowsH * offChartsH;

    if (this.#mediator.api.offChart.length === 1) {
      // adjust chart size for first offChart
      options.rowH = this.rowsH * this.#offChartDefaultH / 100
      options.chartH = this.rowsH - options.rowH

    }
    else {
      // adjust chart size for subsequent offCharts
      options.rowH = rowsH / this.#OffCharts.size
      options.chartH = this.rowsH - rowsH
    }

    for (let o of this.#mediator.api.offChart) {
      this.addOffChart(o, options, api)
    }
    // this.emit("resizeChart", {w: this.rowsW, h: options.chartH})
    // this.#Chart.setDimensions({w: this.rowsW, h: options.chartH})
  }

  /**
   * add off chart indicator below chart and any other off charts
   * @param {object} offChart - data for the indicator
   * @param {object} options 
   * @param {object} api 
   */
  addOffChart(offChart, options, api) {

    this.#elRows.lastElementChild.insertAdjacentHTML("afterend", this.rowNode(offChart.type))
    this.#elOffCharts.push(this.#elRows.lastElementChild)

    this.#elYAxis.lastElementChild.insertAdjacentHTML("afterend", this.scaleNode(offChart.type))
    this.#elYAxisScales.push(this.#elYAxis.lastElementChild)

    api.elements.elOffChart = this.#elRows.lastElementChild
    api.elements.elScale = this.#elYAxis.lastElementChild
    options.offChart = offChart

    let o = this.#mediator.register("OffChart", OffChart, options, api)
    
    this.#OffCharts.set(o.ID, o)

    this.emit("addOffChart", o)
  }

  addIndicator(ind) {
    console.log(`Add the ${ind} indicator`)

    // final indicator object
    const indicator = this.#indicators[ind].ind
    console.log("indicator:",indicator)
    // check if we already have indicator data in the chart state
    // generate indicator data
    // let instance = new indicator(target, overlay, xAxis, yAxis, config)
    // instance.calcIndicator(...)
    // this.addOffChart(instance.overlay.data, options, api)
    // 

    this.emit("addIndicatorDone", indicator)
  }

  defaultNode() {
    const api = this.#mediator.api
    const styleRows = STYLE_ROWS + ` height: calc(100% - ${api.timeH}px)`
    const styleTime = STYLE_TIME + ` height: ${api.timeH}px; border-color: ${this.theme.xAxis.line};`
    const defaultRow = this.defaultRowNode()

    const node = `
    <div class="${CLASS_ROWS}" style="${styleRows}">
      ${defaultRow}
    </div>
    <div class="${CLASS_TIME}" style="${styleTime}">
      <canvas id=""><canvas/>
    </div>
    `
    return node
  }

  defaultRowNode() {
    const api = this.#mediator.api
    const width = api.width - api.toolsW - api.scaleW
    const height = api.height - api.utilsH - api.timeH
    const styleGrid = ` width: ${width}px; height: ${height}px; overflow: hidden`
      // let node = `<div class="${CLASS_GRID}" style="position: absolute;">
      //                 <div class="viewport" style="${styleGrid}"></div>
      //             </div>`
      let node = `<tradex-grid></tradex-grid>`
          node += this.rowNode(CLASS_CHART)

    this.#elYAxis.innerHTML = this.scaleNode(CLASS_CHART)
    
    return node
  }

  rowNode(type) {
    const styleRow = STYLE_ROW + ` border-top: 1px solid ${this.theme.chart.BorderColour};`
    const styleScale = STYLE_SCALE + ` border-color: ${this.theme.xAxis.line};`

    const node = `
      <div class="${CLASS_ROW} ${type}" style="${styleRow}">
        <canvas><canvas/>
        <div style="${styleScale}">
          <canvas id=""><canvas/>
        </div>
      </div>
    `
    return node
  }

  scaleNode(type) {
    const styleRow = STYLE_ROW + ` border-top: 1px solid ${this.theme.chart.BorderColour};`
    const styleScale = STYLE_SCALE + ` border-color: ${this.theme.yAxis.line};`

    // const node = `
    //   <div class="${CLASS_ROW} ${type}" style="${styleRow}">
    //     <div style="${styleScale}">
    //       <canvas id=""><canvas/>
    //     </div>
    //   </div>
    // `
    const node = `
    <div class="${CLASS_ROW} ${type}" style="${styleRow}">
      <tradex-scale style="${styleScale}"></tradex-scale>
    </div>
  `
    return node
  }

  createViewport() {
    const buffer = this.buffer
    const width = this.width
    const height = this.rowsH
    const layerConfig = { 
      width: Math.round(width * ((100 + buffer) * 0.01)), 
      height: height
    }

    // create viewport
    this.#viewport = new CEL.Viewport({
      width: width,
      height: height,
      container: this.#elViewport
    });
    this.#elCanvas = this.#viewport.scene.canvas

    this.#layerLabels = new CEL.Layer(layerConfig);
    this.#layerGrid = new CEL.Layer(layerConfig);
    // add layers
    this.#viewport
          .addLayer(this.#layerLabels)
          .addLayer(this.#layerGrid)

    const config = {...this.theme, ...{ axes: "x" }}
    this.#chartGrid =
      new chartGrid(
        this.#layerGrid, 
        this.#Time, 
        null, 
        config,
        this)
  }

  initXGrid() {
    this.draw()
  }

  draw() {
    window.requestAnimationFrame(()=> {
      this.#layerGrid.setPosition(this.scrollPos, 0)
      this.#chartGrid.draw("x")
      this.#viewport.render();
      this.#Time.draw()
    })
  }

  updateRange(pos) {
    this.#core.updateRange(pos)
    // draw the grid
    this.draw()
  }

  zoomRange() {
    // draw the gird
    this.draw()
  }

  resizeRowPair(divider, pos) {
    let active = divider.offChart
    let ID = active.ID
    let offCharts = Object.keys(this.#OffCharts)
    let i = offCharts.indexOf(ID) - 1
    let prev = (i > 0) ? 
      this.#OffCharts.get(offCharts[i]) :
      this.#Chart;
    let activeH = active.height - pos[5]
    let prevH  = prev.height + pos[5]
    
    if ( activeH >= this.#rowMinH
        && prevH >= this.#rowMinH) {
          divider.offChart.Divider.updateDividerPos(pos)
          active.resize(undefined, activeH)
          prev.resize(undefined, prevH)
    }
    active.element.style.userSelect = 'none';
    // active.element.style.pointerEvents = 'none';
    prev.element.style.userSelect = 'none';
    // prev.element.style.pointerEvents = 'none';

    return {active, prev}
  }

}
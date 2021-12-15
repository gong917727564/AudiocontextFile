import store from '@/store/index'
import Bus from '@/assets/js/bus'

var mediaStreamSource = {}
var audioContext = {}
var meter = {}
var rafID = {}
var merger1 = {}
var merger2 = {}
var pannerLeft = {}
var pannerRight = {}
var splitter = {}
var inputNode = {}
var gainNodeLeft = {}
var gainNodeRight = {}
var percentageLeft = {}
var percentageRight = {}
var hasResumeAudio = []//已经Resume()的audio
var currentCreateArr = [] //当前已经使用audiocontext创建了对象的
let isHadTimer = false
var confirmTimer = null
let audioContextData = {}
let gainSettings = {
  maxGain: 400,
  maxSliderPosition: 299,
  scalingFactor: 100
}
let xFactor = 0.04093171969123015

window.audioContextDebug = false

/**
 *
 * @param {stream} stream from webrtc or rtil
 * @param remoteKey get stream preview id
 * @param volumeBarIdArr canvas id array  index -0 => left canvas id;  index -1 => right canvas id
 */
function audioTrack(stream, remoteKey) {
  if (!stream) return
  var audioStream = new MediaStream()
  audioStream.addTrack(stream.getAudioTracks()[0])
  window.AudioContext = window.AudioContext || window.webkitAudioContext
  audioContext[remoteKey] = new AudioContext()
  mediaStreamSource[remoteKey] = audioContext[
    remoteKey
    ].createMediaStreamSource(audioStream)

  merger1[remoteKey] = audioContext[remoteKey].createChannelMerger(2)
  merger2[remoteKey] = audioContext[remoteKey].createChannelMerger(2)
  inputNode[remoteKey] = audioContext[remoteKey].createGain()
  splitter[remoteKey] = audioContext[remoteKey].createChannelSplitter(2)

  const pannerOptions = { pan: 0 }
  pannerLeft[remoteKey] = new StereoPannerNode(
    audioContext[remoteKey],
    pannerOptions
  )
  pannerRight[remoteKey] = new StereoPannerNode(
    audioContext[remoteKey],
    pannerOptions
  )
  mediaStreamSource[remoteKey].connect(inputNode[remoteKey])

  inputNode[remoteKey].connect(splitter[remoteKey])
  gainNodeLeft[remoteKey] = audioContext[remoteKey].createGain()
  gainNodeRight[remoteKey] = audioContext[remoteKey].createGain()

  splitter[remoteKey].connect(gainNodeLeft[remoteKey], 0)
  splitter[remoteKey].connect(gainNodeRight[remoteKey], 1)


  //静音,将左右声道的声音置为0  取值范围为 0 - 1;
  gainNodeLeft[remoteKey].gain.setValueAtTime(0, audioContext[remoteKey].currentTime)
  gainNodeRight[remoteKey].gain.setValueAtTime(0, audioContext[remoteKey].currentTime)
  gainNodeLeft[remoteKey].gain.value = 0
  gainNodeRight[remoteKey].gain.value = 0
  gainNodeLeft[remoteKey].connect(merger1[remoteKey], 0, 0)
  gainNodeRight[remoteKey].connect(merger2[remoteKey], 0, 1)

  merger1[remoteKey]
    .connect(pannerLeft[remoteKey])
    .connect(audioContext[remoteKey].destination)
  merger2[remoteKey]
    .connect(pannerRight[remoteKey])
    .connect(audioContext[remoteKey].destination)

  meter[remoteKey] = createAudioMeter(audioContext[remoteKey])
  mediaStreamSource[remoteKey].connect(meter[remoteKey])
  audioContext[remoteKey].suspend()//suspend audiocontext  because of chrome not allowed audiocontext auto live
  // audioContext[remoteKey].resume();
  drawLoop(remoteKey)
  if (!store.state.producer.isShowAudioContextDialog) {
    store.commit('producer/setIsShowAudioContextDialog', true)//通知producer.vue 去弹出声音允许弹窗
  }
}

function getGainInPercentage(sliderPosition) {
  let floorValue =
    Math.pow(
      10,
      (sliderPosition + gainSettings.scalingFactor) / gainSettings.scalingFactor
    ) * xFactor
  return Math.floor(floorValue) / 100
}

function calculateMeterVolumeForSources(remoteKey, audioContextIndex) {
  const graphQLData = store.state.producer.currentAudioGraphQl
  let outputVolume = {}
  outputVolume.outputLeft = 0
  outputVolume.outputRight = 0
  if (graphQLData && graphQLData.mute[remoteKey]) {
    if (graphQLData.mute[remoteKey].mute) {
      outputVolume.outputLeft = 0
    } else {
      outputVolume.outputLeft +=
        ((getGainInPercentage(
          graphQLData.sliderPosition[remoteKey].sliderPosition
          ) *
          graphQLData.pan[remoteKey].pan) /
          100) *
        meter[remoteKey].volume[0]
    }
    if (graphQLData.mute[remoteKey].mute) {
      outputVolume.outputRight = 0
    } else {
      outputVolume.outputRight +=
        ((getGainInPercentage(
          graphQLData.sliderPosition[remoteKey].sliderPosition
          ) *
          graphQLData.pan[remoteKey].pan) /
          100) *
        meter[remoteKey].volume[0]
    }
  }
  return outputVolume
}


function drawLoop(remoteKey) {
  const graphQLData = store.state.producer.currentAudioGraphQl
  const features = store.state.producer.features
  // pgm的时候使用当前afv中选中的最大值
  let meterList = meter[remoteKey]
  let outputVolume = calculateMeterVolumeForSources(
    remoteKey
  )
  if (outputVolume && outputVolume.outputLeft !== undefined) {
    meterList.volume[0] = outputVolume.outputLeft
  }
  if (outputVolume && outputVolume.outputRight !== undefined) {
    meterList.volume[1] = outputVolume.outputRight
  }

  if (graphQLData.sliderPosition[remoteKey].sliderPosition !== 0) {
    let volumeLeft = outputVolume.outputLeft
    let volumeRight = outputVolume.outputRight

    // condition applied for to set volume as zero, if the volume is in exponential number
    if (volumeLeft.toString().indexOf('e') > -1) {
      outputVolume.outputLeft = 0
    }
    if (volumeRight.toString().indexOf('e') > -1) {
      outputVolume.outputLeft = 0
    }
  }
  // const params = getVolume(remoteKey)
  const params = outputVolume
  params.key = remoteKey
  audioContextData[remoteKey] = params
  audioContextData = JSON.parse(JSON.stringify(audioContextData))
  Bus.$emit('volumeDataObj', audioContextData) // send data to volume bar
  window.audioContext = audioContext
  rafID[remoteKey] = window.requestAnimationFrame(() => drawLoop(remoteKey))
}

// volume-meter.js;
function createAudioMeter(audioContext, clipLevel, averaging, clipLag) {
  var processor = audioContext.createScriptProcessor(256)
  processor.onaudioprocess = volumeAudioProcess
  processor.clipping = false
  processor.lastClip = 0
  processor.volume = [0, 0]
  processor.clipLevel = clipLevel || 0.98
  processor.averaging = averaging || 0.99
  processor.clipLag = clipLag || 750
  processor.connect(audioContext.destination)
  processor.checkClipping = function () {
    if (!this.clipping) return false
    if (this.lastClip + this.clipLag < window.performance.now())
      this.clipping = false
    return this.clipping
  }
  processor.shutdown = function () {
    this.disconnect()
    this.onaudioprocess = null
  }
  return processor
}

function volumeAudioProcess(event) {
  var self = this
  var buf = event.inputBuffer.getChannelData(0)
  var bufLength = buf.length
  var x = 0
  for (var i = 0; i < event.inputBuffer.numberOfChannels; i++) {
    buf = event.inputBuffer.getChannelData(i)
    bufLength = buf.length
    for (var j = 0; j < bufLength; j++) {
      var sum = 0
      x = buf[j]
      if (Math.abs(x) >= self.clipLevel) {
        self.clipping = true
        self.lastClip = window.performance.now()
      }
      sum += x * x
    }
    var rms = Math.sqrt(sum / bufLength)
    self.volume[i] = Math.max(rms, self.volume[i] * self.averaging)
  }
}

function resumeAudioBar() {
  let audioContext = window.audioContext || {}
  if (!audioContext) return
  Object.keys(audioContext).map(key => {
    if (audioContext[key] && audioContext[key].state === 'suspended') {
      audioContext[key].resume()
      gainNodeLeft[key].gain.value = 0
      gainNodeRight[key].gain.value = 0
      if (window.audioContextDebug) console.log('*****resume****', key + ' : ' + audioContext[key].state)
    }
  })
  if (window.audioContextDebug) console.log('current audioContext status: ', audioContext)
}

let app = document.getElementById('app')

window.addEventListener('click', () => {
  resumeAudioBar()
})


app.onclick = function (event) {
  resumeAudioBar()
}


/*
 * audioTrack => 实例化audiocontext
 * muteVolume => 静音与开音
 * resumeAudio => 恢复挂起的audiocontext.
 * */
export const audioContextObj = {
  audioTrack,
  resumeAudioBar,
  audioContextData
}



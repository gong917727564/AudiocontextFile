<template>
  <span class="vu-meter">
    <canvas
      :width="width"
      :height="height"
      v-draw-meter="{
        amp: dBVal,
        peak: dBPeakVal,
        clipSize: clipSize,
        showPeaks: showPeaks,
        newVolumePercentage: newVolumePercentage,
        volumeDefault: volumeDefault,
        previewId: previewId,
        channelIndex: channelIndex,
      }"
    >
    </canvas>
  </span>
</template>
<script>
export default {
  props: {
    val: {
      type: Number,
      default: 0
    },
    peakVal: {
      type: Number,
      default: 0
    },
    refreshRate: {
      type: Number,
      default: 10
    },
    clipSize: {
      type: Number,
      default: 10
    },
    width: {
      type: Number,
      default: 10
    },
    height: {
      type: Number,
      default: 150
    },
    showPeaks: {
      type: Boolean,
      default: false
    },
    newVolumePercentage: {},
    previewId: {
      type: String
    },
    channelIndex: {
      type: Number
    }
  },
  data() {
    return {
      volumeDefault: 440,
      pId: null,
      cIdx: null,
      isMute: false
    }
  },
  computed: {
    dBVal: function () {
      // console.log(this.val)
      return 20 * Math.log10(this.val * 16)
    },
    dBPeakVal: function () {
      return 20 * Math.log10(this.peakVal)
    }
  },
  watch: {
    val: function (newVal) {
      if (this.showPeaks) {
        var smoothingFactor = 50
        if (newVal > this.peakVal) {
          this.peakVal = newVal
        } else {
          this.peakVal =
            newVal * (1 / smoothingFactor) +
            this.peakVal * ((smoothingFactor - 1) / smoothingFactor)
        }
      }
    }
  },
  directives: {
    drawMeter: function (canvas, binding) {
      var clipSize = binding.value.clipSize
      var showPeaks = binding.value.showPeaks
      var amp = binding.value.amp / 60 + 0.92
      var peak = binding.value.peak / 76 + 1
      var w = canvas.width
      var h = canvas.height
      var currentVolumeLevel = (h * binding.value.newVolumePercentage) / 100
      if (currentVolumeLevel == undefined || isNaN(currentVolumeLevel)) {
        currentVolumeLevel = binding.value.volumeDefault
      } else if (currentVolumeLevel !== binding.value.volumeDefault) {
        binding.value.volumeDefault = currentVolumeLevel
      }
      var hInRange = currentVolumeLevel - clipSize
      var ctx = canvas.getContext('2d')
      var gradient = ctx.createLinearGradient(0, 0, 0, h)
      gradient.addColorStop(0, 'red')
      gradient.addColorStop(clipSize / h, 'red')
      gradient.addColorStop(clipSize / h, 'orange')
      gradient.addColorStop(1, 'lime')
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = gradient

      ctx.fillRect(0, h - hInRange * amp, w, currentVolumeLevel * amp)
      if (showPeaks) {
        if (peak >= 1) {
          ctx.fillStyle = 'red'
        } else {
          ctx.fillStyle = 'greenyellow'
        }
        ctx.fillRect(0, Math.round(currentVolumeLevel - hInRange * peak), w, 1)
      }
      ctx.fillStyle = 'white'
      ctx.fillRect(0, clipSize, w, 1)
    }
  }
}
</script>
<style
  lang="scss"
  scoped
>
.vu-meter {
  canvas {
    height: 100% !important;
    width: 4px !important;
    background-color: #3d3f40;
  }
}
</style>

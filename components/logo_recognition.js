console.log('IMPORTING LOGO RECOGNITION')

var style = document.createElement('style');
style.innerHTML = ``;
document.getElementsByTagName('head')[0].appendChild(style);

Vue.component('logo-recognition-viz', {
    props: ['json_data', 'video_info'],
    data: function () { return { confidence_threshold: 0.5, interval_timer: null, ctx: null } },
    computed: {
        logo_tracks: function () {
            if (!this.json_data.annotation_results) return []
            for (let i = 0; i < this.json_data.annotation_results.length; i++) {
                if ('logo_recognition_annotations' in this.json_data.annotation_results[i])
                    return this.json_data.annotation_results[i].logo_recognition_annotations
            }
            return []
        },
        indexed_logo_tracks: function () {
            const t = []
            this.logo_tracks.forEach(el => {
                const d = new Logo_Detected(el, this.video_info.height, this.video_info.width, this.confidence_threshold)
                if (d.segments.length > 0) t.push(d)
            })
            return t
        },
        object_track_segments: function () {
            const segments = {}
            this.indexed_logo_tracks.forEach(ot => {
                if (!(ot.name in segments)) segments[ot.name] = { 'segments': [], 'count': 0 }
                ot.segments.forEach(ls => {
                    segments[ot.name].count++
                    var added = false
                    for (let i = 0; i < segments[ot.name].length; i++) {
                        const seg = segments[ot.name].segments[i]
                        if (ls.start_time < seg[1]) {
                            segments[ot.name].segments[i][1] = Math.max(segments[ot.name].segments[i][1], ls.end_time)
                            added = true; break
                        }
                    }
                    if (!added) segments[ot.name].segments.push([ls.start_time, ls.end_time])
                })
            })
            return segments
        }
    },
    methods: {
        segment_style: function (segment) {
            return {
                left: ((segment[0] / this.video_info.length) * 100).toString() + '%',
                width: (((segment[1] - segment[0]) / this.video_info.length) * 100).toString() + '%'
            }
        },
        segment_clicked: function (segment_data) {
            this.$emit('segment-clicked', { seconds: segment_data[0] - 0.5 })
        }
    },
    template: `
    <div calss="object-tracking-container">
        <div class="confidence">
            <span>Confidence threshold</span>
            <input type="range" min="0.0" max="1" value="0.5" step="0.01" v-model="confidence_threshold">
            <span class="confidence-value">{{confidence_threshold}}</span>
        </div>
        <div class="data-warning" v-if="logo_tracks.length == 0"> No logo detection data in JSON</div>
        <transition-group name="segments" tag="div">
            <div class="segment-container" v-for="segments, key in object_track_segments" v-bind:key="key + 'z'">
                <div class="label">{{key}} ({{segments.count}})</div>
                <div class="segment-timeline">
                    <div class="segment" v-for="segment in segments.segments" 
                                        v-bind:style="segment_style(segment)" 
                                        v-on:click="segment_clicked(segment)"
                    ></div>
                </div>
            </div>
        </transition-group>
    </div>
    `,
    mounted: function () {
        console.log('mounted component')
        var canvas = document.getElementById("my_canvas")
        this.ctx = canvas.getContext("2d")
        this.ctx.font = "20px Roboto"
        const ctx = this.ctx
        const component = this
        this.interval_timer = setInterval(function () {
            console.log('running')
            draw_bounding_boxes(component.indexed_logo_tracks, ctx)
        }, 1000 / 30)
    },
    beforeDestroy: function () {
        console.log('destroying component')
        clearInterval(this.interval_timer)
        this.ctx.clearRect(0, 0, 800, 500)
    }
})

class Logo_Frame {
    constructor(json_data, video_height, video_width) {
        this.time_offset = nullable_time_offset_to_seconds(json_data.time_offset)
        this.box = {
            'x': (json_data.normalized_bounding_box.left || 0) * video_width,
            'y': (json_data.normalized_bounding_box.top || 0) * video_height,
            'width': ((json_data.normalized_bounding_box.right || 0) - (json_data.normalized_bounding_box.left || 0)) * video_width,
            'height': ((json_data.normalized_bounding_box.bottom || 0) - (json_data.normalized_bounding_box.top || 0)) * video_height
        }
    }
}

class Logo_Track {
    constructor(json_data, video_height, video_width) {
        this.start_time = nullable_time_offset_to_seconds(json_data.segment.start_time_offset)
        this.end_time = nullable_time_offset_to_seconds(json_data.segment.end_time_offset)
        this.confidence = json_data.confidence
        this.frames = []
        json_data.timestamped_objects.forEach(frame => { this.frames.push(new Logo_Frame(frame, video_height, video_width)) })
    }
    has_frames_for_time(seconds) { return ((this.start_time <= seconds) && (this.end_time >= seconds)) }
    most_recent_real_bounding_box(seconds) {
        for (let i = 0; i < this.frames.length; i++) {
            if (this.frames[i].time_offset > seconds) { return i > 0 ? this.frames[i-1].box : null }
        }
        return null
    }
    most_recent_interpolated_bounding_box(seconds) {
        for (let i = 0; i < this.frames.length; i++) {
            if (this.frames[i].time_offset > seconds) {
                if (i > 0) {
                    if ((i == 1) || (i == this.frames.length - 1)) return this.frames[i-1].box
                    const s = this.frames[i-1], e = this.frames[i]
                    const r = (seconds - s.time_offset) / (e.time_offset - s.time_offset)
                    return {
                        'x': s.box.x + (e.box.x - s.box.x) * r, 'y': s.box.y + (e.box.y - s.box.y) * r,
                        'width': s.box.width + (e.box.width - s.box.width) * r, 'height': s.box.height + (e.box.height - s.box.height) * r
                    }
                } else return null
            }
        }
        return null
    }
    current_bounding_box(seconds, interpolate = true) {
        return interpolate ? this.most_recent_interpolated_bounding_box(seconds) : this.most_recent_real_bounding_box(seconds)
    }
}

class Logo_Detected {
    constructor(json_data, video_height, video_width, confidence_threshold) {
        this.name = json_data.entity.description
        this.id = json_data.entity.entity_id
        this.segments = []
        json_data.tracks.forEach(track => {
            if (track.confidence > confidence_threshold) this.segments.push(new Logo_Track(track, video_height, video_width))
        })
    }
    has_frames_for_time(seconds) {
        for (let i = 0; i < this.segments.length; i++) { if (this.segments[i].has_frames_for_time(seconds)) return true }
        return false
    }
    current_bounding_box(seconds, interpolate = true) {
        for (let i = 0; i < this.segments.length; i++) {
            if (this.segments[i].has_frames_for_time(seconds)) return this.segments[i].current_bounding_box(seconds, interpolate)
        }
        return null
    }
}
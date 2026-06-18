// define style rules to be programtically loaded
var style = document.createElement('style');
style.innerHTML = `

.text-detected{
    display: inline-block;
    margin: 4px;
    border: 2px solid #1a1a1a;
    padding: 8px 12px;
    font-family: 'Space Mono', monospace;
    font-size: 0.78rem;
    font-weight: 700;
    color: #1a1a1a;
    background: #ffffff;
    transition: all 80ms ease;
}

.text-detected:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px #1a1a1a;
}

.time-pill{
    color: #ffffff;
    background: #1a1a1a;
    padding: 2px 8px;
    margin: 2px;
    display: inline-block;
    cursor: pointer;
    font-size: 0.7rem;
    font-weight: 700;
    font-family: 'Space Mono', monospace;
    transition: all 80ms ease;
}

.time-pill:hover{
    background: #ff3d00;
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0px #1a1a1a;
}

`;
document.getElementsByTagName('head')[0].appendChild(style);

Vue.component('text-detection-viz', {
    props: ['json_data', 'video_info'],
    data: function () {
        return {
            confidence_threshold: 0.5, current_time: 0, interval_timer: null,
            interval_timer_current_text: null, interval_timer_current_text_frame_rate: 10,
            ctx: null, frame_rate: 30
        }
    },
    computed: {
        text_tracks: function () {
            if (!this.json_data.annotation_results) return []
            for (let i = 0; i < this.json_data.annotation_results.length; i++) {
                if ('text_annotations' in this.json_data.annotation_results[i])
                    return this.json_data.annotation_results[i].text_annotations
            }
            return []
        },
        indexed_text_tracks: function () {
            const t = []
            if (!this.text_tracks) return []
            this.text_tracks.forEach(el => {
                const td = new Text_Detection(el, this.video_info.height, this.video_info.width, this.confidence_threshold)
                if (td.segments.length) t.push(td)
            })
            t.sort((a, b) => (a.start_time > b.start_time) ? 1 : -1)
            return t
        },
        current_indexed_text_tracks: function () {
            const d = []
            if (indexed_text_tracks) {
                indexed_text_tracks.forEach(el => { if (el.has_frames_for_time(this.current_time)) d.push(el) })
            }
            return d
        }
    },
    methods: {
        segment_style: function (segment) {
            return {
                left: ((segment[0] / this.video_info.length) * 100).toString() + '%',
                width: (((segment[1] - segment[0]) / this.video_info.length) * 100).toString() + '%'
            }
        },
        segment_clicked: function (seconds) { this.$emit('segment-clicked', { seconds: seconds }) }
    },
    template: `
    <div calss="object-tracking-container">
        <div class="confidence">
            <span>Confidence threshold</span>
            <input type="range" min="0.0" max="1" value="0.5" step="0.01" v-model="confidence_threshold">
            <span class="confidence-value">{{confidence_threshold}}</span>
        </div>
        <div class="data-warning" v-if="text_tracks.length == 0"> No face detection data in JSON</div>
        <div class="current_labels">
        <p>Detected text on screen:</p>
            <div v-for="text in indexed_text_tracks" v-bind:key="text.id" v-if="text.has_frames_for_time(current_time)">{{text.text}}</div>
        </div>
        <div>
        <p style="color:#1a1a1a;margin:16px 0 8px;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;font-family:'Space Mono',monospace;">All detected text:</p>
            <div class="text-detected" v-for="text in indexed_text_tracks">
                {{text.text}}
                    <span class="time-pill" v-for="segment in text.segments" v-on:click="segment_clicked(segment.start_time)">
                        {{parseInt(segment.start_time)}}s
                    </span>
            </div>
        </div>
    </div>
    `,
    mounted: function () {
        console.log('mounted component')
        var canvas = document.getElementById("my_canvas")
        this.ctx = canvas.getContext("2d")
        this.ctx.font = "20px Roboto"
        const ctx = this.ctx, component = this
        this.interval_timer = setInterval(function () {
            draw_bounding_polys(component.indexed_text_tracks, ctx)
        }, 1000 / this.frame_rate)
        this.interval_timer_current_text = setInterval(function () {
            component.current_time = video.currentTime
        }, 1000 / this.interval_timer_current_text_frame_rate)
    },
    beforeDestroy: function () {
        console.log('destroying component')
        clearInterval(this.interval_timer)
        clearInterval(this.interval_timer_current_text)
        this.ctx.clearRect(0, 0, 800, 500)
    }
})

function draw_bounding_polys(object_tracks, ctx) {
    ctx.clearRect(0, 0, 800, 500)
    const current_time = video.currentTime
    object_tracks.forEach(tracked_object => {
        if (tracked_object.has_frames_for_time(current_time)) {
            draw_bounding_poly(tracked_object.current_bounding_box(current_time), tracked_object.text, ctx)
        }
    })
}

function draw_bounding_poly(poly, name = null, ctx) {
    ctx.strokeStyle = "#4285F4"
    ctx.beginPath()
    ctx.lineWidth = 3
    ctx.moveTo(poly[0].x, poly[0].y)
    poly.forEach(point => { ctx.lineTo(point.x, point.y) })
    ctx.lineTo(poly[0].x, poly[0].y)
    ctx.stroke()
}

class Text_Frame {
    constructor(json_data, video_height, video_width) {
        this.time_offset = nullable_time_offset_to_seconds(json_data.time_offset)
        this.poly = []
        json_data.rotated_bounding_box.vertices.forEach(vertex => {
            this.poly.push({ x: vertex.x * video_width, y: vertex.y * video_height })
        })
    }
    toString() {
        var output = ''
        this.poly.forEach(point => { output += point.x.toString() + point.y.toString() })
        return output
    }
}

class Text_Segment {
    constructor(json_data, video_height, video_width) {
        this.start_time = nullable_time_offset_to_seconds(json_data.segment.start_time_offset)
        this.end_time = nullable_time_offset_to_seconds(json_data.segment.end_time_offset)
        this.confidence = json_data.confidence
        this.frames = []
        json_data.frames.forEach(frame => { this.frames.push(new Text_Frame(frame, video_height, video_width)) })
    }
    has_frames_for_time(seconds) { return ((this.start_time <= seconds) && (this.end_time >= seconds)) }
    most_recent_real_poly(seconds) {
        for (let i = 0; i < this.frames.length; i++) {
            if (this.frames[i].time_offset > seconds) { return i > 0 ? this.frames[i-1].poly : null }
        }
        return null
    }
    most_recent_interpolated_poly(seconds) {
        for (let i = 0; i < this.frames.length; i++) {
            if (this.frames[i].time_offset > seconds) {
                if (i > 0) {
                    if ((i == 1) || (i == this.frames.length - 1)) return this.frames[i-1].poly
                    const s = this.frames[i-1], e = this.frames[i]
                    const r = (seconds - s.time_offset) / (e.time_offset - s.time_offset)
                    const p = []
                    for (let j = 0; j < 4; j++) {
                        p.push({ x: s.poly[j].x + (e.poly[j].x - s.poly[j].x) * r, y: s.poly[j].y + (e.poly[j].y - s.poly[j].y) * r })
                    }
                    return p
                } else return null
            }
        }
        return null
    }
    current_bounding_box(seconds, interpolate = true) {
        return interpolate ? this.most_recent_interpolated_poly(seconds) : this.most_recent_real_poly(seconds)
    }
}

class Text_Detection {
    constructor(json_data, video_height, video_width, confidence_threshold) {
        this.text = json_data.text
        this.segments = []
        json_data.segments.forEach(segment => {
            const ns = new Text_Segment(segment, video_height, video_width)
            if (ns.confidence > confidence_threshold) this.segments.push(ns)
        })
        if (this.segments.length) {
            this.start_time = this.segments[0].start_time
            this.end_time = this.segments[this.segments.length - 1].end_time
            this.start_poly = this.segments[0].frames[0]
            this.id = this.start_time.toString() + this.end_time.toString() + this.start_poly.toString()
        }
    }
    has_frames_for_time(seconds) {
        for (let i = 0; i < this.segments.length; i++) { if (this.segments[i].has_frames_for_time(seconds)) return true }
        return false
    }
    current_bounding_box(seconds, interpolate = false) {
        for (let i = 0; i < this.segments.length; i++) {
            if (this.segments[i].has_frames_for_time(seconds)) return this.segments[i].current_bounding_box(seconds)
        }
        return null
    }
}
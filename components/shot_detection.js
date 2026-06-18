// define style rules to be programtically loaded
var style = document.createElement('style');
style.innerHTML = `

.scene{
    display: inline-block;
    margin: 4px;
    padding: 8px 14px;
    cursor: pointer;
    font-family: 'Space Mono', monospace;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #1a1a1a;
    background: #ffffff;
    border: 2px solid #1a1a1a;
    transition: all 80ms ease;
}

.scene:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px #1a1a1a;
}

.scene:active {
    transform: translate(2px, 2px);
    box-shadow: none;
}

.scene .material-icons {
    font-size: 15px;
    vertical-align: middle;
    color: #888888;
}

.scene.current{
    color: #ffffff;
    background: #1a1a1a;
    box-shadow: 4px 4px 0px #ff3d00;
}

.scene.current .material-icons {
    color: #ff3d00;
}

`;
document.getElementsByTagName('head')[0].appendChild(style);


// define component
Vue.component('shot-detection-viz', {
    props: ['json_data', 'video_info'],
    data: function () {
        return {
            interval_timer: null,
            current_time: 0
        }
    },
    computed: {
        detected_shots: function () {
            `
            Extract just the shot detection data from json
            `
            if (!this.json_data.annotation_results)
                return []

            for (let index = 0; index < this.json_data.annotation_results.length; index++) {
                if ('shot_annotations' in this.json_data.annotation_results[index])
                    return this.json_data.annotation_results[index].shot_annotations
            }
            return []
        },

        indexed_detected_shots: function () {
            `
            Create a clean list of detected shots
            `

            const indexed_shots = []

            if (this.detected_shots) {

                this.detected_shots.forEach(element => {
                    const detected_shot = new Detected_Shot(element)

                    if (detected_shot.within_time(this.current_time))
                        detected_shot.current_shot = true

                    indexed_shots.push(detected_shot)
                    
                    // if (detected_label.segments.length > 0)
                    //     indexed_segments.push(detected_label)
                })
            }

            return indexed_shots
        },
    },
    methods: {
        // segment_style: function (segment) {
        //     return {
        //         left: ((segment.start_time / this.video_info.length) * 100).toString() + '%',
        //         width: (((segment.end_time - segment.start_time) / this.video_info.length) * 100).toString() + '%'
        //     }
        // },
        shot_clicked: function (shot_data) {
            this.$emit('shot-clicked', { seconds: shot_data.start_time })
        },
        // label_on_screen: function (label) {
        //     return label.has_segment_for_time(this.current_time)
        // }
    },
    template: `
    <div calss="shot_detection-container">

    <div class="data-warning" v-if="detected_shots.length == 0"> No shot data in JSON</div>

    <div class="scene" v-for="shot in indexed_detected_shots" v-on:click="shot_clicked(shot)" v-bind:class="{ current: shot.current_shot }"> {{shot.start_time.toFixed(2)}}s 
    <span class="material-icons">
    horizontal_rule
    </span>
    ({{shot.duration.toFixed(2)}}s)
    
    <span class="material-icons">
        east
    </span>
    {{shot.end_time.toFixed(2)}}s</div>

    </div>
    `,
    mounted: function () {
        console.log('mounted component')

        const component = this

        this.interval_timer = setInterval(function () {
            component.current_time = video.currentTime
        }, 1000 / 5)
    },
    beforeDestroy: function () {
        console.log('destroying component')
        clearInterval(this.interval_timer)
    }
})


class Detected_Shot {
    constructor(json_data) {
        this.start_time = nullable_time_offset_to_seconds(json_data.start_time_offset)
        this.end_time = nullable_time_offset_to_seconds(json_data.end_time_offset)
        this.duration = this.end_time - this.start_time
        this.current_shot = false
    }

    within_time(seconds) {
        return ((this.start_time <= seconds) && (this.end_time >= seconds))
    }

}
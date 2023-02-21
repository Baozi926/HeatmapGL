# heatmap 

super fast 


```javascript 
var heatmap = new Heatmap({
                    canvas: document.getElementById("heatmap-image"),
                    radius: defaultRadius,
                    data: data,
                    width: 1928, //width of data
                    height: 2090, //height of data
                    gradient: {
                        0: "rgb(0,0,255,0)",
                        0.25: "rgb(0,0,255)",
                        0.55: "rgb(0,255,0)",
                        0.85: "yellow",
                        1.0: "rgb(255,0,0)",
                    },
                })

```
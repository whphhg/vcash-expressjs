/**
 * Rewards per day graph
 *
 * Based on http://bl.ocks.org/mbostock/3885304
 */
(function() {
    var rewards_per_day = function(id, data) {
        render(id, data);
    }

    function render(id, data) {
        var margin = {top: 20, right: 10, bottom: 50, left: 40},
            width = window.innerWidth / 3,
            height = 300 - margin.top - margin.bottom;

        var x = d3.scale.ordinal()
            .rangeRoundBands([0, width], .1);

        var y = d3.scale.linear()
            .range([height, 0]);

        var xAxis = d3.svg.axis()
            .scale(x)
            .orient("bottom");

        var yAxis = d3.svg.axis()
            .scale(y)
            .orient("left")
            .ticks(5);

        var svg = d3.select(id).append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
          .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

          x.domain(data.map(function(d) { return d.date; }));
          y.domain([0, d3.max(data, function(d) { return d.rewards; })]);

          svg.append("g")
              .attr("class", "x axis")
              .attr("transform", "translate(0," + height + ")")
              .call(xAxis)
          .selectAll("text")
              .style("text-anchor", "end")
              .attr("dx", "-.8em")
              .attr("dy", "-.55em")
              .attr("transform", "rotate(-90)");

          svg.append("g")
              .attr("class", "y axis")
              .call(yAxis)

          svg.selectAll(".bar")
              .data(data)
            .enter().append("rect")
              .attr("class", "bar")
              .attr("x", function(d) { return x(d.date); })
              .attr("width", x.rangeBand())
              .attr("y", function(d) { return y(d.rewards); })
              .attr("height", function(d) { return height - y(d.rewards); });
    }

    function type(d) {
        d.rewards = +d.rewards;
        return d;
    }

    if (typeof define === "function" && define.amd) define(rewards_per_day);
    else if (typeof module === "object" && module.exports) module.exports = rewards_per_day;
    this.rewards_per_day = rewards_per_day;
})();

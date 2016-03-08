var http = require("http");
var url = require('url');
var fs = require('fs');
var PNG = require('png-coder').PNG;
var Stream = require('stream');

module.exports = {

  generateMapLayout: function(pos_x, pos_y){
    var URL_GOOGLE = "/maps/api/staticmap?center="+pos_x+","+pos_y+"&zoom=14&format=png8&sensor=false&size=480x630&maptype=roadmap&style=feature:road.arterial|element:geometry|color:0x00ff00&style=feature:administrative|visibility:off&style=feature:landscape|visibility:off&style=feature:poi|visibility:off&style=feature:transit|visibility:off&style=feature:water|visibility:off&style=feature:road.highway|visibility:off&style=feature:road.local|visibility:off&style=feature:road.arterial|element:labels|visibility:off&key=AIzaSyDxF7kGBnlOpDMp6wf-pMN8HCrRiMKIMVg";
    var rstream = new Stream.Readable();
    rstream._read = function noop() {};
    var buff=[];
    var layout=[];

    //*** Request the server ***
    var getResponse = http.get({
      hostname: 'maps.googleapis.com',
      port: 80,
      path: URL_GOOGLE,
      agent: false

    }, (res) => {
      //*** Do stuff with response ***
      var body='';
      // *** read data and put it into the read steram ***
      res.on('data', function(chunk) {
        body += chunk;
        rstream.push(chunk);
      });
      // *** end read stream and output to file ***
      res.on('end', function() {
        rstream.push(null);
        var png = rstream.pipe(new PNG({
            filterType: 4
        }));
        png.on('parsed', function(){
          for (var y = 0; y < this.height; y+=30) {
            var row=[];
            for (var x = 0; x < this.width; x+=30) {
              var rgb = 0;
              // *** check if block is blank ***
              for(var block_y = y; block_y<y+30; block_y++ ){
                for(var block_x = x; block_x<x+30; block_x++){
                  var idx = (this.width * block_y + block_x) << 2;
                  rgb += this.data[idx]+this.data[idx+1]+this.data[idx+2];
                }
              }
              console.log(rgb);
              // *** Map layout completition ***
              if(rgb>0) row[x/30]='t';
              else row[x/30]='p';
              //invert color
              /*this.data[idx] = 255 - this.data[idx];
              this.data[idx+1] = 255 - this.data[idx+1];
              this.data[idx+2] = 255 - this.data[idx+2];*/
              
            }
            layout[y/30]=row;
          }
          console.log(layout);
          console.log("h: "+this.height+" w: "+this.width);
          this.pack().pipe(fs.createWriteStream("./out.png"));
          //*** save to a file ***          
        });
      }); 
    });
    getResponse.end();
    return layout;    
  }
}




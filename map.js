var Stream = require('stream');
var http = require("http");
var fs = require('fs');
var PNG = require('png-coder').PNG;

module.exports = {

  generateMapLayout: function(pos_x, pos_y, zoom, callback){
    var URL_GOOGLE = "/maps/api/staticmap?center="+pos_x+","+pos_y+"&zoom="+zoom+"&format=png8&sensor=false&size=480x630&maptype=roadmap&style=feature:road.arterial|element:geometry|color:0x00ff00&style=feature:administrative|visibility:off&style=feature:landscape|visibility:off&style=feature:poi|visibility:off&style=feature:transit|visibility:off&style=feature:water|visibility:off&style=feature:road.highway|visibility:off&style=feature:road.local|visibility:off&style=feature:road.arterial|element:labels|visibility:off&key=AIzaSyDxF7kGBnlOpDMp6wf-pMN8HCrRiMKIMVg";
    var rstream = new Stream.Readable();
    rstream._read = function noop() {};

    //*** Request the server ***
    var getResponse = http.get({
      hostname: 'maps.googleapis.com',
      port: 80,
      path: URL_GOOGLE,
      agent: false,
      connection: 'close'

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
          var layout = "";
          for (var y = 0; y < this.height; y+=30) {
            for (var x = 0; x < this.width; x+=30) {
              var rgb = 0;
              // *** check if block is blank ***
              for(var block_y = y; block_y<y+30; block_y++ ){
                for(var block_x = x; block_x<x+30; block_x++){
                  var idx = (this.width * block_y + block_x) << 2;
                  // Look only for green pixels
                  if(this.data[idx+1]==255)
                    rgb ++;
                }
              }
              // *** Map layout completition ***
              if(x==0 || x >= this.width-30 || y==0 || y>=this.height-30 || rgb>0)
                layout+='p';
              else
                layout+='t';
            }
            layout+='\n';
          }
          // *** Callback, generate png ***
          callback(layout);
          this.pack().pipe(fs.createWriteStream("./out.png"));
        });
      });
      res.on('error',function(err){
        console.log(err);
      });
    });
  }
}




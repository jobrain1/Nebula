const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'Assets', 'Logo_Icon_Transparent_bg.png.png.png');
const outputPath = path.join(__dirname, 'icon.ico');

fs.readFile(inputPath, (err, data) => {
    if (err) {
        console.error('Error reading PNG:', err);
        process.exit(1);
    }

    pngToIco([data])
        .then(buf => {
            fs.writeFileSync(outputPath, buf);
            console.log('✓ Icon created successfully: icon.ico');
        })
        .catch(err => {
            console.error('Error creating icon:', err);
            process.exit(1);
        });
});

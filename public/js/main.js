document.querySelector('input[type="file"]').addEventListener('change', e => {

    const trainingDataFieldset = document.querySelector('.trainingData');
    trainingDataFieldset.innerHTML = '';

    const fileList = e.target.files;
    for (file of fileList){

        trainingDataFieldset.insertAdjacentHTML("beforeend", `
            <fieldset>
                <legend> Details for file: ${file.name} </legend>
                <label for="${file.name}_ocr_text">Enter OCR Text</label>
                <input type="text" id="${file.name}_ocr_text" name="${file.name}_ocr_text">

                <fieldset>
                    <legend>Bounding Box</legend>
                    
                    <div class="form-field">
                        <label for="${file.name}_xmin">xmin</label>
                        <input type="text" id="${file.name}_xmin" name="${file.name}_bnd_box>
                    </div>

                    <div class="form-field">
                        <label for="${file.name}_ymin">ymin</label>
                        <input type="text" id="${file.name}_ymin" name="${file.name}_bnd_box">
                    </div>

                    <div class="form-field">
                        <label for="${file.name}_xmax">xmax</label>
                        <input type="text" id="${file.name}_xmax" name="${file.name}_bnd_box">
                    </div>

                    <div class="form-field">
                        <label for="${file.name}_ymax">ymax</label>
                        <input type="text" id="${file.name}_ymax" name="${file.name}_bnd_box">
                    </div>
                </fieldset>
            </fieldset>`
        );
    }

})
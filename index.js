const express = require("express");
const serveIndex = require("serve-index");
const fileUpload = require("express-fileupload");
const app = express();
const path = require("path");
const port = 3001;
var cors = require("cors");
const pdfParse = require("pdf-parse");
app.use(
  cors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.use(fileUpload());

app.use("/public", express.static("public/uploads"));
app.use(
  "/uploads",
  express.static("public/uploads"),
  serveIndex("public/uploads", { icons: true })
);

const multiFileUpload = async ({ file, data, res }) => {
  const keywords = data[0].split(/\s*[\s,]\s*/).filter((e) => e);

  try {
    let count = file.length - 1;
    const promises = file.map((f) => {
      // check if the file is a pdf
      if (f.mimetype !== "application/pdf") {
        throw new Error("Invalid file type");
      }
      pdfParse(f).then((results) => {
        // check if any of the keywords are present in the array
        const ifExist = keywords.some((value) =>
          results.text.toLocaleLowerCase().includes(value.toLocaleLowerCase())
        );

        // this variable will be used to send the response when map is completed,
        //because we need to wait for all the promises to be resolved before sending the response back to the user
        // also we can't send multiple responses at the same time
        count--;
        if (ifExist) {
          // if true then send the response with included keywords
          // the function is taking the true values only and returning an array
          const newData = getTheKeywords({
            keywords,
            results,
            foundValues: true,
          });
          // if true then save the file in the accepted folder
          savaPdf({ file: f, accepted: true });
          if (count === 0) {
            res
              .status(200)
              .send({ done: true, message: "Found keywords", data: newData });
          }
        } else {
          savaPdf({ file: f, accepted: false });

          if (count === 0) {
            res.status(200).send({
              done: true,
              message: "Nothing found",
              data: keywords,
            });
          }
        }
      });
    });

    await Promise.all(promises);
  } catch (error) {
    res.status(500).send(error);
    console.log(error);
  }
};

const savaPdf = ({ file, accepted, res, data }) => {
  // a file name is generated using the original file name
  // we can use UUID to generate a unique name to avoid any name conflicts or file replacement
  // but for this project we will use the original file name to replace the file if it already exists
  const fileName = path.parse(file.name).name + path.extname(file.name);

  // if the file is accepted then save it in the accepted folder
  const fileAccepted = path.join(
    __dirname,
    "public",
    "uploads/accepted/" + fileName
  );
  // if the file is rejected then save it in the rejected folder
  const fileRejected = path.join(
    __dirname,
    "public",
    "uploads/rejected/" + fileName
  );
  if (accepted) {
    // if the accepted parameter is true then save the file in the accepted folder
    file.mv(fileAccepted, function (err) {
      if (err) {
        return res.status(500).send(err);
      } else {
        res &&
          res.status(200).send({ done: true, message: "Found keywords", data });
      }
    });
  } else {
    // if the accepted parameter is false then save the file in the rejected folder
    file.mv(fileRejected, function (err) {
      if (err) {
        res.status(500).send(err);
      } else {
        // for multiple files we need to send the response after all the promises are resolved
        // so in multiFileUpload function we will not use the res variable
        res &&
          res.status(200).send({ done: true, message: "Nothing found ", data });
      }
    });
  }
};

const getTheKeywords = ({ keywords, results }) => {
  const data = keywords.filter((value) => {
    let found = [];

    let v = results.text
      .toLocaleLowerCase()
      .includes(value.toLocaleLowerCase());

    if (v) {
      // push the true values only
      found.push(v);
      return found;
    }
  });
  return data;
};

const singleFileUpload = (file, data, res) => {
  try {
    // check if the file is a pdf
      if (file.mimetype !== "application/pdf") {
        throw new Error("Invalid file type");
      }

    let keywords = data.split(/\s*[\s,]\s*/).filter((e) => e);
    // get the pdf file and parse it
    pdfParse(file).then((results) => {
      // transform the text to lowercase and check if the keywords are present
      // here we will get true or false
      if (
        keywords.some((value) =>
          results.text.toLocaleLowerCase().includes(value.toLocaleLowerCase())
        )
      ) {
        // if true then send the response with included keywords
        const data = getTheKeywords({ keywords, results });
        // if true then save the file in the accepted folder
        savaPdf({ file, accepted: true, res, data });
      } else {
        // if the file does not contain the keyword then save it in the rejected folder and send the keywords
        savaPdf({
          file,
          accepted: false,
          res,
          data: keywords, // Passing all keywords not the filtered keywords
        });
      }
    });
  } catch (error) {
    res.status(500).send({ done: true, message: "Data Error", data: [] });
    console.log(error);
  }
};

app.post("/upload", async (req, res) => {
  try {
    const file = req.files.file;
    const data = req.body.key;

    // check if the file is single or multiple
    if (file.length) multiFileUpload({ file, data, res });
    else singleFileUpload(file, data, res);
  } catch (error) {
    console.log(error);
    res.status(500).send({ done: true, message: "Data Error", data: [] });
  }
});

app.get("/", (req, res) => {
  res.send("Resume Parser Server");
});

/* app.listen( () => {
  console.log(`listening `);
}); */

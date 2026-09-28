import yauzl from "yauzl";
import { fail } from "../errors.js";
const MAX_EXPANDED = 25 * 1024 * 1024;
// Count actual decompressed bytes before handing an uploaded archive to the workbook parser.
export async function validateWorkbookArchive(buffer) {
  const zip = await new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
  await new Promise((resolve, reject) => {
    let expanded = 0,
      entries = 0,
      finished = false;
    const abort = (error) => {
      if (finished) return;
      finished = true;
      zip.close();
      reject(error);
    };
    zip.on("error", abort);
    zip.on("end", () => {
      if (!finished) {
        finished = true;
        zip.close();
        resolve();
      }
    });
    zip.on("entry", (entry) => {
      if (
        ++entries > 1000 ||
        expanded + entry.uncompressedSize > MAX_EXPANDED
      ) {
        try {
          fail(
            413,
            "Excel file is too large when expanded (maximum 25 MB / 1,000 archive entries).",
          );
        } catch (error) {
          abort(error);
        }
        return;
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error) return abort(error);
        stream.on("error", abort);
        stream.on("data", (chunk) => {
          expanded += chunk.length;
          if (expanded > MAX_EXPANDED) {
            stream.destroy();
            try {
              fail(
                413,
                "Excel file is too large when expanded (maximum 25 MB).",
              );
            } catch (error) {
              abort(error);
            }
          }
        });
        stream.on("end", () => {
          if (!finished) zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
}

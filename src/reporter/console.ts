import { ContextStore } from "../context/store";

export function printFinalOutput(context: ContextStore) {
  const last = context.timeline[context.timeline.length - 1];

  console.log("\n■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■");
  console.log("Final Output");
  console.log("■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■\n");

  if (last) {
    console.log(last.output);
  } else {
    console.log("No output generated.");
  }
}

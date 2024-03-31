import { main } from "../src/main.js";

main('./example.txt').then(res => {
    console.log('Success')
}, (err) => {
    console.error(err)
})

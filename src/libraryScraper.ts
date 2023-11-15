import { load } from 'cheerio';
import { RoomBooking, Room } from "./types";
import toSydneyTime from "./toSydneyTime";
import axios from "axios";
import * as fs from 'fs';

const ROOM_URL = "https://unswlibrary-bookings.libcal.com/space/";
const BOOKINGS_URL = "https://unswlibrary-bookings.libcal.com/spaces/availability/grid";
const LIBRARIES = [
    { name: 'Main Library', libcalCode: '6581', buildingId: 'K-F21' },
    { name: 'Law Library', libcalCode: '6584', buildingId: 'K-E8' },
];

const scrapeLibraryBookings = async (library: typeof LIBRARIES[number]) => {

    const response = await downloadBookingsPage(library.libcalCode);

    const bookingData = parseBookingData(response.data['slots']);

    const allRoomData: Room[] = [];
    const allRoomBookings: RoomBooking[] = [];

    for (const roomID in bookingData) {
        let roomData: Room | null = null;
        try {
            roomData = await getRoomData(roomID, library.buildingId);
        } catch (e) {
            console.warn(`Failed to scrape room ${roomID} in ${library.buildingId}`);
        }

        if (!roomData) continue; // skipping non-rooms
        allRoomData.push(roomData);

        for (const booking of bookingData[roomID]) {
            const roomBooking: RoomBooking = {
                bookingType: 'LIB',
                name: "Library Booking",
                roomId: roomData.id,
                start: booking.start,
                end: booking.end,
            }
            allRoomBookings.push(roomBooking);
        }
    }

    return { rooms: allRoomData, bookings: allRoomBookings };
}

// Formats a date into YYYY-MM-DD format
const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

const downloadBookingsPage = async(locationId: string) => {

    const todaysDate = formatDate(new Date());

    // Furthest seems to be 2 weeks in the future
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    const furthestBookableDate = formatDate(twoWeeks);

    const postData = {
        lid: locationId,
        gid: '0',
        eid: '-1',
        seat: '0',
        seatId: '0',
        zone: '0',
        start: todaysDate,
        end: furthestBookableDate,
        pageIndex: '0',
        pageSize: '18'
    };

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded', // because the request data is URL encoded
        'Referer': 'https://unswlibrary-bookings.libcal.com/'
    };

    return await axios.post(BOOKINGS_URL, new URLSearchParams(postData), { headers });
}

interface ResponseData {
    start: string,
    end: string,
    itemId: number,
    checksum: string,
    className: string | null
}

const parseBookingData = (bookingData: ResponseData[]) => {

    const bookings: { [roomNumber: number]: { start: Date, end: Date }[] } = {};

    for (const slot of bookingData) {
        if (!(slot.itemId in bookings)) {
            bookings[slot.itemId] = [];
        }

        if (slot.className == "s-lc-eq-checkout") {
            bookings[slot.itemId].push(
                {
                    start: toSydneyTime(new Date(slot.start)),
                    end: toSydneyTime(new Date(slot.end)),
                }
            )
        }
    }

    return bookings;
}

const getRoomData = async (roomId: string, buildingId: string) => {

    const response = await axios.get(ROOM_URL + roomId, {});
    const $ = load(response.data);

    const $heading = $('h1#s-lc-public-header-title');

    // Remove whitespace and split the name, location and capacity into newlines
    const data = $heading.text().trim().split(/\s{2,}/g);
    const [name, rawLocation, rawCapacity] = data;
    const capacity = parseInt(rawCapacity.split(": ")[1]);

    // We only care about rooms and pods
    if (!name.match(/RM|POD/)) {
        return null;
    }

    let roomNumber = name.split(' ')[2];
    if (name.match(/POD/)) {
        // Pods are just numbered 1-8 so prepend POD
        roomNumber = 'POD' + roomNumber;
    }

    const libraryName = rawLocation.replace(/[()]/, '').split(':')[0];

    const roomData: Room = {
        name: libraryName + ' ' + name,
        abbr: name,
        id: buildingId + "-" + roomNumber,
        usage: "LIB",
        capacity: capacity,
        school: " "
    }

    return roomData;
}

const runScrapeJob = async () => {
    const allRooms: Room[] = [];
    const allBookings: RoomBooking[] = [];
    for (const library of LIBRARIES) {
        const { rooms, bookings } = await scrapeLibraryBookings(library);
        allRooms.push(...rooms);
        allBookings.push(...bookings);
    }

    fs.writeFileSync('rooms.json', JSON.stringify(allRooms, null, 4));
    fs.writeFileSync('bookings.json', JSON.stringify(allBookings, null, 4));
}

console.time('Scraping');
runScrapeJob().then(() => console.timeEnd('Scraping'));
